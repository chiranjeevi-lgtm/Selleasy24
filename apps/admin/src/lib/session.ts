import 'server-only';

import { cookies } from 'next/headers';

/**
 * Session handling.
 *
 * Tokens live in httpOnly cookies and are attached to API calls from server
 * context only. They are never sent to the browser as readable values, and never
 * touch localStorage.
 *
 * This matters more here than on a typical app: a stolen access token can read a
 * seller's buyer enquiries — names and phone numbers. localStorage is readable by
 * any injected script; an httpOnly cookie is not.
 */

export const ACCESS_COOKIE = 'ki_at';
export const REFRESH_COOKIE = 'ki_rt';

/** Refresh once the access token has under this long left, to avoid mid-request expiry. */
export const REFRESH_SKEW_SECONDS = 90;

const isProduction = process.env.NODE_ENV === 'production';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    // 'lax' rather than 'strict': the session must survive a top-level
    // navigation back from an email link (verification, password reset).
    sameSite: 'lax' as const,
    path: '/',
  };
}

export async function setSessionCookies(tokens: TokenPair): Promise<void> {
  const store = await cookies();

  store.set(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookieOptions(),
    maxAge: tokens.expiresIn,
  });

  store.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookieOptions(),
    // Matches the API's JWT_REFRESH_TTL of 7 days.
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_COOKIE)?.value;
}

export interface TokenClaims {
  sub: string;
  role: string;
  exp: number;
}

/**
 * Reads the claims out of an access token WITHOUT verifying the signature.
 *
 * This is safe only because the value is never trusted for an authorisation
 * decision — the API verifies every token on every request. Here the claims are
 * used for two presentational things: knowing when to refresh, and picking which
 * navigation to render. Treating an unverified claim as proof of anything would
 * be a serious mistake, so nothing downstream does.
 */
export function readClaimsUnverified(token: string): TokenClaims | null {
  const segments = token.split('.');
  if (segments.length !== 3 || !segments[1]) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(segments[1], 'base64url').toString('utf8'),
    ) as Partial<TokenClaims>;

    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
      return null;
    }
    return {
      sub: payload.sub,
      role: typeof payload.role === 'string' ? payload.role : 'BUYER',
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function isExpiringSoon(claims: TokenClaims): boolean {
  return claims.exp * 1000 - Date.now() < REFRESH_SKEW_SECONDS * 1000;
}
