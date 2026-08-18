import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@kamala/db';

import { REQUIRED_ROLES_KEY, type AuthenticatedUser } from './auth.decorators';

/**
 * Authorisation guard implementing the PRD permission matrix.
 *
 * Runs after JwtAuthGuard, so `request.user` is already populated and trusted.
 * A route with no @Roles() decorator is open to any authenticated user — the
 * roles decorator narrows, it does not grant.
 *
 * Deliberately flat: there is no role hierarchy. ADMIN does not implicitly
 * satisfy @Roles(Role.VERIFIER). Implicit escalation is how permission bugs hide,
 * so every endpoint lists the roles it accepts.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      // A @Roles() route that is also @Public() — a wiring mistake, not a client
      // error. Fail closed and make it obvious.
      throw new ForbiddenException('This action requires an authenticated user.');
    }

    if (!requiredRoles.includes(user.role)) {
      // Says what is needed, never what the caller is or what exists behind it.
      throw new ForbiddenException('You do not have permission to perform this action.');
    }

    return true;
  }
}
