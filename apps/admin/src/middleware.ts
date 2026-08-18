import { NextResponse, type NextRequest } from 'next/server';

/**
 * Two jobs, both of which must happen before a page renders:
 *
 *  1. Refresh an access token that is about to expire. Middleware is the only
 *     place that can both read and write cookies before render — a server
 *     component cannot set cookies, so refreshing there is impossible.
 *
 *  2. Gate the seller area. This is convenience, not security: the API enforces
 *     every permission independently. Middleware only saves the user from
 *     loading a page that would then fail.
 */

const ACCESS_COOKIE = 'ki_at';
const REFRESH_COOKIE = 'ki_rt';
const REFRESH_SKEW_SECONDS = 90;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const isProduction = process.env.NODE_ENV === 'production';

interface Claims {
  exp: number;
  role: string;
}

/** Roles the console is for. Mirrors REVIEW_ROLES on the API. */
const STAFF_ROLES = new Set(['VERIFIER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']);

function readClaims(token: string): Partial<Claims> | null {
  const segments = token.split('.');
  if (segments.length !== 3 || !segments[1]) {
    return null;
  }
  try {
    return JSON.parse(
      Buffer.from(segments[1], 'base64url').toString('utf8'),
    ) as Partial<Claims>;
  } catch {
    return null;
  }
}

function readExp(token: string): number | null {
  const exp = readClaims(token)?.exp;
  return typeof exp === 'number' ? exp : null;
}

/**
 * Whether this session belongs to staff.
 *
 * Read from the token without verifying its signature, which is fine for what
 * this does: the API independently checks the role on every request, from the
 * database rather than the token. Forging a role here buys nothing but a
 * console that refuses every action.
 *
 * It exists because the alternative is worse than useless — a seller could sign
 * in, see the console shell, fill in a verification decision, and only then be
 * told "You do not have permission to perform this action", with no indication
 * that the account was wrong all along.
 */
function isStaffToken(token: string | undefined): boolean {
  if (!token) return false;
  const role = readClaims(token)?.role;
  return typeof role === 'string' && STAFF_ROLES.has(role);
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  const exp = accessToken ? readExp(accessToken) : null;
  const needsRefresh =
    Boolean(refreshToken) &&
    (!accessToken || exp === null || exp * 1000 - Date.now() < REFRESH_SKEW_SECONDS * 1000);

  let response = NextResponse.next();
  let effectiveAccessToken = accessToken;

  if (needsRefresh && refreshToken) {
    try {
      const refreshResponse = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        cache: 'no-store',
      });

      if (refreshResponse.ok) {
        const tokens = (await refreshResponse.json()) as {
          accessToken: string;
          refreshToken: string;
          expiresIn: number;
        };

        const options = {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'lax' as const,
          path: '/',
        };

        response.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
          ...options,
          maxAge: tokens.expiresIn,
        });
        response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
          ...options,
          maxAge: 7 * 24 * 60 * 60,
        });

        effectiveAccessToken = tokens.accessToken;
      } else {
        /**
         * Refresh was refused. The API treats a replayed refresh token as theft
         * and revokes the whole family, so this is also what a genuine user sees
         * after their session was stolen and used. Clearing both cookies is the
         * correct response: send them back to a clean sign-in.
         */
        response.cookies.delete(ACCESS_COOKIE);
        response.cookies.delete(REFRESH_COOKIE);
        effectiveAccessToken = undefined;
      }
    } catch {
      // API unreachable. Leave cookies alone and let the page handle the error —
      // logging the user out because of a transient network fault would be worse.
    }
  }

  const isConsole = pathname.startsWith('/queue') || pathname.startsWith('/review') || pathname.startsWith('/reports');

  if (isConsole && !effectiveAccessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    const redirect = NextResponse.redirect(loginUrl);
    // Carry any cookie changes onto the redirect, or a just-cleared session
    // would linger.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  /*
   * Signed in, but not as staff — a buyer or seller who reached the console.
   * Sent back to sign-in with an explanation rather than into a shell where
   * every button fails.
   */
  if (isConsole && !isStaffToken(effectiveAccessToken)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'staff-only');
    const redirect = NextResponse.redirect(loginUrl);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}

export const config = {
  /**
   * Runs on the console and the sign-in page.
   * There is no public surface in this app — every route needs a live staff
   * session.
   */
  matcher: ['/queue/:path*', '/review/:path*', '/reports/:path*', '/login'],
};
