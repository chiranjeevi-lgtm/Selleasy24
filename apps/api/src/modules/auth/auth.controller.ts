import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import {
  CurrentUser,
  Public,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  requestOtpSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  verifyOtpSchema,
  type AuthenticatedUserResponse,
  type LoginDto,
  type RefreshDto,
  type RegisterDto,
  type RequestOtpDto,
  type RequestPasswordResetDto,
  type ResetPasswordDto,
  type VerifyEmailDto,
  type VerifyOtpDto,
} from './auth.dto';
import { PhoneVerificationService } from '../../common/otp/phone-verification.service';
import { AuthService, type AuthResult, type RequestContext } from './auth.service';
import type { TokenPair } from './token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly phoneVerification: PhoneVerificationService,
  ) {}

  @Public()
  @Post('register')
  // Tighter than the global bucket: registration creates rows and sends mail.
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  @ApiOperation({ summary: 'Create an account as a buyer, owner or broker' })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
    @Req() req: Request,
  ): Promise<AuthResult> {
    return this.auth.register(dto, this.context(req));
  }

  // -------------------------------------------------------------------------
  // Phone verification
  // -------------------------------------------------------------------------

  @Public()
  @Post('phone/request-code')
  @HttpCode(HttpStatus.OK)
  /*
   * Three per fifteen minutes per IP. Each request costs real money once a
   * provider is connected, and an unthrottled endpoint is a way to run up a
   * bill on someone else's account as well as to harass a phone number.
   */
  @Throttle({ default: { ttl: 900_000, limit: 3 } })
  @ApiOperation({
    summary: 'Send a one-time code to a phone number',
    description:
      'Returns the code itself only when the configured delivery driver is the console driver used for local development and demonstrations. Real providers never return it.',
  })
  async requestPhoneCode(
    @Body(new ZodValidationPipe(requestOtpSchema)) dto: RequestOtpDto,
  ) {
    return this.phoneVerification.request(dto.phone);
  }

  @Post('phone/verify')
  @HttpCode(HttpStatus.OK)
  // Attempt limiting lives on the code itself; this only slows down someone
  // cycling through fresh codes.
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @ApiOperation({
    summary: 'Confirm a one-time code and mark the caller’s phone verified',
    description:
      'Requires a session: the code proves control of the number, and the session says which account it belongs to.',
  })
  async verifyPhoneCode(
    @Body(new ZodValidationPipe(verifyOtpSchema)) dto: VerifyOtpDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.phoneVerification.verify(dto.phone, dto.code);
    return this.auth.markPhoneVerified(user.id, dto.phone);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // 5 attempts per 15 minutes per IP, per the PRD. Overrides the global bucket
  // for this handler only — a stricter limit here must not leak onto other routes.
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @ApiOperation({ summary: 'Sign in with email and password' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
  ): Promise<AuthResult> {
    return this.auth.login(dto, this.context(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new token pair',
    description:
      'Rotates the refresh token. Presenting an already-used token is treated as theft and revokes the entire token family.',
  })
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto,
    @Req() req: Request,
  ): Promise<TokenPair> {
    return this.auth.refresh(dto.refreshToken, this.context(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the supplied refresh token' })
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.logout(dto.refreshToken, user.id, this.context(req));
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  @ApiOperation({ summary: 'Confirm an email address using a verification token' })
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) dto: VerifyEmailDto,
  ): Promise<{ verified: true }> {
    return this.auth.verifyEmail(dto.token);
  }

  @Public()
  @Post('request-password-reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Always returns success, whether or not the address is registered, so the endpoint cannot be used to enumerate accounts.',
  })
  async requestPasswordReset(
    @Body(new ZodValidationPipe(requestPasswordResetSchema)) dto: RequestPasswordResetDto,
    @Req() req: Request,
  ): Promise<{ requested: true }> {
    return this.auth.requestPasswordReset(dto.email, this.context(req));
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @ApiOperation({
    summary: 'Set a new password using a reset token',
    description: 'Invalidates every existing session for the account on success.',
  })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
    @Req() req: Request,
  ): Promise<{ reset: true }> {
    return this.auth.resetPassword(dto, this.context(req));
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated user' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<AuthenticatedUserResponse> {
    // Explicit select rather than returning the record: passwordHash and lockout
    // state must never reach a response.
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        sellerKind: true,
        isEmailVerified: true,
        phone: true,
        isPhoneVerified: true,
      },
    });
    return record;
  }

  /**
   * Extracts client context for audit and token records.
   *
   * `req.ip` is trustworthy here because main.ts sets `trust proxy` to 1, so
   * Express takes the last hop rather than any client-supplied value.
   */
  private context(req: Request): RequestContext {
    return {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }
}
