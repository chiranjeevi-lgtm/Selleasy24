import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, SellerKind, type User } from '@kamala/db';

import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import type {
  AuthenticatedUserResponse,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto';
import { PasswordService } from './password.service';
import { TokenService, type TokenPair } from './token.service';

/** Failed attempts before an account is temporarily locked (PRD: 10). */
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_MINUTES = 15;

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
/** Short by design — a reset link is a temporary credential. */
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;

export interface AuthResult extends TokenPair {
  user: AuthenticatedUserResponse;
}

export interface RequestContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * A valid argon2 hash of a random string, used to equalise login timing when
   * the account does not exist. Computed once, lazily.
   */
  private decoyHash: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  async register(dto: RegisterDto, ctx: RequestContext): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    /**
     * Returning a conflict here does reveal that an email is registered.
     *
     * The enumeration-resistant alternative — always reply "check your inbox" —
     * leaves a user who forgot they had an account with no feedback at all, and
     * is a poor trade for a consumer marketplace. The paths where enumeration
     * actually matters, login and password reset, are both generic below.
     */
    if (existing) {
      throw new ConflictException('An account with that email already exists.');
    }

    const passwordHash = await this.passwords.hash(dto.password);

    // Sellers carry an Owner/Broker label; buyers do not.
    const sellerKind =
      dto.role === Role.OWNER
        ? SellerKind.OWNER
        : dto.role === Role.BROKER
          ? SellerKind.BROKER
          : null;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        phone: dto.phone ?? null,
        passwordHash,
        role: dto.role,
        sellerKind,
        reraNumber: dto.reraNumber ?? null,
      },
    });

    await this.audit.record({
      actorId: user.id,
      action: AuditAction.USER_REGISTERED,
      entityType: 'user',
      entityId: user.id,
      // Role is recorded; email and phone are not — they are already on the user
      // record and duplicating PII into the audit trail widens exposure.
      metadata: { role: user.role },
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    await this.sendEmailVerification(user);

    const pair = await this.tokens.issuePair(user, ctx.ip, ctx.userAgent);
    return { ...pair, user: this.toResponse(user) };
  }

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  async login(dto: LoginDto, ctx: RequestContext): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    /**
     * Unknown account: verify against a decoy hash anyway.
     *
     * Skipping the argon2 work would make "no such user" measurably faster than
     * "wrong password", turning response latency into an account-enumeration
     * oracle. Doing the work discards that signal.
     */
    if (!user) {
      await this.passwords.verify(await this.getDecoyHash(), dto.password);
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      // States the fact without revealing whether the submitted password was
      // correct — a locked account tells an attacker nothing either way.
      throw new ForbiddenException(
        'This account is temporarily locked after too many failed sign-in attempts. Try again later.',
      );
    }

    const passwordValid = await this.passwords.verify(user.passwordHash, dto.password);

    if (!passwordValid) {
      await this.registerFailedAttempt(user, ctx);
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.isActive) {
      throw new ForbiddenException('This account has been suspended. Contact support.');
    }

    // Successful login clears the failure counter and any expired lock.
    const refreshed = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await this.audit.record({
      actorId: user.id,
      action: AuditAction.USER_LOGGED_IN,
      entityType: 'user',
      entityId: user.id,
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    const pair = await this.tokens.issuePair(refreshed, ctx.ip, ctx.userAgent);
    return { ...pair, user: this.toResponse(refreshed) };
  }

  async refresh(refreshToken: string, ctx: RequestContext): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken, ctx.ip, ctx.userAgent);
  }

  async logout(refreshToken: string, actorId: string, ctx: RequestContext): Promise<void> {
    await this.tokens.revoke(refreshToken);
    await this.audit.record({
      actorId,
      action: AuditAction.USER_LOGGED_OUT,
      entityType: 'user',
      entityId: actorId,
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }

  // -------------------------------------------------------------------------
  // Email verification
  // -------------------------------------------------------------------------

  /**
   * Records a verified phone number against the account.
   *
   * Called only after PhoneVerificationService has confirmed the code, so this
   * trusts that the caller controls the number. It does not trust that the
   * number is unclaimed: `phone` is unique, and two people racing to verify the
   * same number must not both end up owning it.
   */
  async markPhoneVerified(
    userId: string,
    phone: string,
  ): Promise<{ phone: string; isPhoneVerified: true }> {
    const existing = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    if (existing && existing.id !== userId) {
      throw new ConflictException('That phone number is already in use on another account.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { phone, isPhoneVerified: true },
      select: { phone: true },
    });

    return { phone: updated.phone!, isPhoneVerified: true };
  }

  async verifyEmail(token: string): Promise<{ verified: true }> {
    const tokenHash = this.passwords.hashToken(token);

    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, isEmailVerified: true } } },
    });

    if (!record || record.usedAt !== null || record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('This verification link is invalid or has expired.');
    }

    // Single transaction: the token must be consumed exactly once, so a replayed
    // link cannot re-verify or be reused after a later email change.
    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: record.userId },
        data: { isEmailVerified: true },
      });
      await this.audit.recordInTransaction(tx, {
        actorId: record.userId,
        action: AuditAction.USER_EMAIL_VERIFIED,
        entityType: 'user',
        entityId: record.userId,
      });
    });

    return { verified: true };
  }

  // -------------------------------------------------------------------------
  // Password reset
  // -------------------------------------------------------------------------

  /**
   * Always resolves successfully, whether or not the address is registered.
   *
   * This endpoint is unauthenticated and trivially scriptable, so any difference
   * in response between a known and unknown address is a bulk enumeration tool.
   */
  async requestPasswordReset(email: string, ctx: RequestContext): Promise<{ requested: true }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, fullName: true },
    });

    if (user) {
      const token = this.passwords.generateToken();

      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.passwords.hashToken(token),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });

      const url = `${this.config.getOrThrow<string>('APP_PUBLIC_URL')}/reset-password?token=${token}`;
      await this.mail.send({
        to: user.email,
        subject: 'Reset your SellEasy24 password',
        text: `Hello ${user.fullName},\n\nUse the link below to set a new password. It expires in 15 minutes.\n\n${url}\n\nIf you did not request this, you can safely ignore this email.`,
      });

      await this.audit.record({
        actorId: user.id,
        action: AuditAction.USER_PASSWORD_RESET_REQUESTED,
        entityType: 'user',
        entityId: user.id,
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
    }

    return { requested: true };
  }

  async resetPassword(dto: ResetPasswordDto, ctx: RequestContext): Promise<{ reset: true }> {
    const tokenHash = this.passwords.hashToken(dto.token);

    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt !== null || record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('This reset link is invalid or has expired.');
    }

    const passwordHash = await this.passwords.hash(dto.password);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          // A successful reset also clears a lockout — otherwise an attacker
          // could lock a victim out of their own recovered account.
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await this.audit.recordInTransaction(tx, {
        actorId: record.userId,
        action: AuditAction.USER_PASSWORD_RESET,
        entityType: 'user',
        entityId: record.userId,
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
    });

    /**
     * Every existing session is invalidated.
     *
     * A password reset is the remedy for a suspected compromise; leaving the
     * attacker's refresh tokens alive would make it useless.
     */
    await this.tokens.revokeAllForUser(record.userId);

    return { reset: true };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async registerFailedAttempt(user: User, ctx: RequestContext): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
      },
    });

    await this.audit.record({
      actorId: user.id,
      action: shouldLock ? AuditAction.USER_LOCKED_OUT : AuditAction.USER_LOGIN_FAILED,
      entityType: 'user',
      entityId: user.id,
      metadata: { attempts },
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    if (shouldLock) {
      this.logger.warn(`Account ${user.id} locked after ${attempts} failed sign-in attempts`);
    }
  }

  private async sendEmailVerification(user: Pick<User, 'id' | 'email' | 'fullName'>): Promise<void> {
    const token = this.passwords.generateToken();

    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: this.passwords.hashToken(token),
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });

    const url = `${this.config.getOrThrow<string>('APP_PUBLIC_URL')}/verify-email?token=${token}`;
    await this.mail.send({
      to: user.email,
      subject: 'Confirm your SellEasy24 email address',
      text: `Welcome to SellEasy24, ${user.fullName}.\n\nConfirm your email address using the link below. It expires in 24 hours.\n\n${url}`,
    });
  }

  private async getDecoyHash(): Promise<string> {
    this.decoyHash ??= await this.passwords.hash(this.passwords.generateToken());
    return this.decoyHash;
  }

  private toResponse(user: User): AuthenticatedUserResponse {
    // Explicit field list, not a spread-and-delete: a new sensitive column added
    // to User cannot leak into responses by default.
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      sellerKind: user.sellerKind,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      phone: user.phone,
    };
  }
}
