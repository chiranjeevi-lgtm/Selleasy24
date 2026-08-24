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
}

function readExp(token: string): number | null {
  const segments = token.split('.');
  if (segments.length !== 3 || !segments[1]) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(segments[1], 'base64url').toString('utf8'),
    ) as Partial<Claims>;
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
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

  // Projects moved under /seller, so one prefix now covers every selling page.
  const isGatedArea = pathname.startsWith('/seller');

  if (isGatedArea && !effectiveAccessToken) {
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

  return response;
}

export const config = {
  /**
   * The seller and builder areas, the buyer's own pages, and the auth pages.
   *
   * Deliberately excludes public browsing: a buyer searching listings has no
   * session to refresh, and adding a middleware hop to the most-visited pages
   * would cost latency for nothing.
   *
   * `/saved` and `/visits` are here because they are signed-in-only and refuse
   * to render without a session. Without the refresh hop, arriving on one more
   * than fifteen minutes after the last page load bounces the user to sign-in
   * even though their refresh token is still good.
   */
  matcher: [
    '/seller/:path*',
    '/welcome/:path*',
    '/saved',
    '/visits',
    '/login',
    '/register',
  ],
};
