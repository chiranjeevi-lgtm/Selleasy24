import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Role, User } from '@kamala/db';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import { PasswordService } from './password.service';

export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  role: Role;
  /** Guards against an access token being replayed on the refresh endpoint. */
  typ: 'access';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Issues and rotates authentication tokens.
 *
 * Design:
 *  - Access tokens are short-lived JWTs, never stored server-side.
 *  - Refresh tokens are opaque random strings, stored only as SHA-256 hashes.
 *    A database leak therefore does not yield usable refresh tokens.
 *  - Every refresh rotates: the presented token is consumed and a new one
 *    issued. Presenting an already-rotated token means it was captured, so the
 *    entire token family is revoked rather than just rejecting the request.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Issues a fresh pair, starting a new token family. Used at login. */
  async issuePair(user: Pick<User, 'id' | 'role'>, ip?: string, userAgent?: string): Promise<TokenPair> {
    return this.issueInFamily(user, randomUUID(), ip, userAgent);
  }

  /**
   * Exchanges a refresh token for a new pair.
   *
   * Throws UnauthorizedException for every failure mode, with the same message,
   * so a caller cannot distinguish "unknown token" from "expired" from "reused".
   */
  async rotate(presentedToken: string, ip?: string, userAgent?: string): Promise<TokenPair> {
    const tokenHash = this.passwords.hashToken(presentedToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, role: true, isActive: true } } },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid or expired session.');
    }

    // ---- Reuse detection --------------------------------------------------
    // A token that was already rotated or explicitly revoked is being presented
    // a second time. Either it was stolen, or a legitimate client raced. Both
    // warrant invalidating every descendant of that login: the attacker holds
    // one of them and we cannot tell which.
    if (stored.rotatedAt !== null || stored.revokedAt !== null) {
      await this.revokeFamily(stored.familyId);
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; revoked token family ${stored.familyId}`,
      );
      throw new UnauthorizedException('Invalid or expired session.');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired session.');
    }

    if (!stored.user.isActive) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Invalid or expired session.');
    }

    // Consume the presented token, then issue its successor in the same family.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { rotatedAt: new Date() },
    });

    return this.issueInFamily(stored.user, stored.familyId, ip, userAgent);
  }

  /** Revokes a single token — used at logout. */
  async revoke(presentedToken: string): Promise<void> {
    const tokenHash = this.passwords.hashToken(presentedToken);
    // updateMany rather than update: a logout with an unknown token must succeed
    // silently rather than reveal whether the token existed.
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every live token in a family. */
  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every live token for a user — used on password change. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueInFamily(
    user: Pick<User, 'id' | 'role'>,
    familyId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role, typ: 'access' };

    const accessTtl = this.config.getOrThrow<string>('JWT_ACCESS_TTL');
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });

    const refreshToken = this.passwords.generateToken();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.passwords.hashToken(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
        createdByIp: ip ?? null,
        // Truncated: user-agent strings are unbounded and we only need enough to
        // recognise a device in an audit trail.
        createdByAgent: userAgent?.slice(0, 255) ?? null,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.ttlToSeconds(accessTtl),
    };
  }

  private refreshTtlMs(): number {
    return this.ttlToSeconds(this.config.getOrThrow<string>('JWT_REFRESH_TTL')) * 1000;
  }

  /** Parses a `15m` / `7d` / `3600` style TTL into seconds. */
  private ttlToSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])?$/.exec(ttl.trim());
    if (!match?.[1]) {
      throw new Error(`Unparseable TTL: "${ttl}". Expected forms like 900, 15m, 24h, 7d.`);
    }
    const value = Number(match[1]);
    switch (match[2]) {
      case 'd':
        return value * 86_400;
      case 'h':
        return value * 3_600;
      case 'm':
        return value * 60;
      default:
        return value;
    }
  }
}
