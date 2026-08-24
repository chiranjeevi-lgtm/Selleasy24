import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import type { AccessTokenPayload } from '../../modules/auth/token.service';
import { IS_PUBLIC_KEY, type AuthenticatedUser } from './auth.decorators';

/**
 * Global authentication guard — deny by default.
 *
 * Registered as an APP_GUARD, so every route requires a valid bearer token
 * unless it carries @Public(). A newly added endpoint is therefore protected
 * by omission rather than exposed by omission.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = this.extractBearerToken(request);

    /**
     * Public routes: identify the caller if we can, but never reject.
     *
     * Several public handlers want to know who is asking without requiring it —
     * a listing detail page counts views, and a seller refreshing their own
     * listing should not inflate that number. Returning early here left
     * `request.user` permanently undefined, so those checks compared
     * `undefined !== sellerId` and silently never fired.
     *
     * A missing, malformed or expired token is simply an anonymous visitor.
     * Nothing on a public route may depend on the user being present.
     */
    if (isPublic) {
      if (token) {
        request.user = (await this.identify(token)) ?? undefined;
      }
      return true;
    }

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      // Expired, malformed and wrong-signature all collapse to one message: the
      // distinction is useful to an attacker and to nobody else.
      throw new UnauthorizedException('Invalid or expired token.');
    }

    // A refresh token must never authenticate a normal request. Without this
    // check, the long-lived credential would work everywhere the short-lived one
    // does, defeating the point of having two.
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    /**
     * Re-read the user on every request.
     *
     * This costs one indexed primary-key lookup and buys immediate revocation:
     * a suspended or deactivated account stops working at once instead of
     * remaining valid until its access token expires. For a platform that
     * suspends accounts for fraud, waiting out a token lifetime is not
     * acceptable.
     */
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    // Role comes from the database, not the token, so a role change takes effect
    // immediately and a stale token cannot retain elevated privileges.
    request.user = { id: user.id, role: user.role };
    return true;
  }

  /**
   * Best-effort identification for a public route.
   *
   * Deliberately returns null on every failure instead of throwing. It applies
   * the same active-account check as the strict path, so a suspended user is
   * anonymous here rather than partially recognised.
   */
  private async identify(token: string): Promise<AuthenticatedUser | null> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      if (payload.typ !== 'access') {
        return null;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, isActive: true },
      });

      if (!user || !user.isActive) {
        return null;
      }

      return { id: user.id, role: user.role };
    } catch {
      return null;
    }
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) {
      return null;
    }
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) {
      return null;
    }
    return value.trim();
  }
}
