import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@kamala/db';

export const IS_PUBLIC_KEY = 'kamala:isPublic';
export const REQUIRED_ROLES_KEY = 'kamala:requiredRoles';

/**
 * Marks a route as reachable without authentication.
 *
 * Authentication is deny-by-default via a global guard, so a new endpoint is
 * protected unless it explicitly opts out here. That ordering matters: the
 * opposite default means one forgotten decorator silently exposes data.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Restricts a route to the given roles.
 *
 * Roles are checked against the authenticated user's single `role` field. There
 * is no implicit hierarchy — ADMIN does not automatically satisfy
 * `@Roles(Role.VERIFIER)`. List every role that should have access, so the
 * permission surface of an endpoint is readable at the call site rather than
 * inferred from a precedence table.
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);

/** The authenticated principal attached to the request by JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  role: Role;
}

/**
 * Injects the authenticated user.
 *
 * Always prefer this over reading `request.user`: it is typed, and it makes the
 * handler's dependency on authentication explicit in its signature.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user) {
      // Reaching here means a handler used @CurrentUser() on a @Public() route.
      // A programming error, surfaced loudly rather than yielding undefined.
      throw new Error(
        'CurrentUser requested on a route with no authenticated user. Remove @Public() or stop using @CurrentUser().',
      );
    }
    return request.user;
  },
);
