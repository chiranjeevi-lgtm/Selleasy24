'use server';

import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { clearSessionCookies, setSessionCookies, type TokenPair } from '@/lib/session';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

interface AuthResponse extends TokenPair {
  user: { role: string };
}

/**
 * Where to send a user after signing in.
 *
 * Only same-site relative paths are honoured. An unvalidated `next` parameter is
 * a textbook open-redirect: an attacker sends a login link with
 * `?next=https://evil.example`, the victim signs in, and gets forwarded to a
 * convincing fake.
 */
function safeRedirectTarget(next: string | undefined, role: string): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }
  // A builder's inventory is their projects, so that is their landing page —
  // sending them to the buyer search would be as odd as sending an owner there.
  if (role === 'BUILDER') {
    return '/seller/projects';
  }
  if (role === 'OWNER' || role === 'BROKER') {
    return '/seller/listings';
  }
  // Field agents and pending applicants land on their status page — it is
  // the one surface that always tells them where their application stands
  // (pending / active / suspended). The assignment dashboard is not yet
  // built, so this stays canonical until that ships.
  if (role === 'FIELD_AGENT' || role === 'AGENT_APPLICANT') {
    return '/agent/status';
  }
  // Buyer (and anything else that reaches here) — profile hub.
  if (role === 'BUYER') {
    return '/profile';
  }
  return '/';
}

async function postAuth(path: string, payload: unknown): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    let message = 'Something went wrong. Try again.';
    let fieldErrors: Record<string, string> | undefined;
    try {
      const body = (await response.json()) as {
        message?: string;
        errors?: Array<{ field: string; message: string }>;
      };
      if (body.message) {
        message = body.message;
      }
      if (body.errors) {
        fieldErrors = {};
        for (const issue of body.errors) {
          // First error per field wins — showing five rules at once on one input
          // is noise, not help.
          fieldErrors[issue.field] ??= issue.message;
        }
      }
    } catch {
      // Keep the generic message.
    }
    const error = new ApiError(response.status, message);
    (error as ApiError & { fieldErrors?: Record<string, string> }).fieldErrors = fieldErrors;
    throw error;
  }

  return (await response.json()) as AuthResponse;
}

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const next = form.get('next');

  let result: AuthResponse;
  try {
    result = await postAuth('login', {
      // `identifier` accepts either the user's email or their username —
      // the API decides by the presence of an '@'.
      identifier: String(form.get('identifier') ?? '')
        .trim()
        .toLowerCase(),
      password: String(form.get('password') ?? ''),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      const withFields = error as ApiError & { fieldErrors?: Record<string, string> };
      return { error: error.message, fieldErrors: withFields.fieldErrors };
    }
    return { error: 'Could not reach the server. Check your connection.' };
  }

  await setSessionCookies(result);
  // redirect() throws, so it must sit outside the try block or it would be
  // swallowed as an error.
  redirect(safeRedirectTarget(typeof next === 'string' ? next : undefined, result.user.role));
}

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const role = String(form.get('role') ?? 'BUYER');
  const reraNumber = String(form.get('reraNumber') ?? '').trim();
  const phone = String(form.get('phone') ?? '').trim();
  const username = String(form.get('username') ?? '')
    .trim()
    .toLowerCase();
  // Referral code arrives as a hidden input on the register form, pre-filled
  // by the page when `?ref=CODE` is present in the URL. Empty string → omit
  // from the body so the API's optional field is genuinely absent (not
  // "").  Any invalid code is silently swallowed server-side so the signup
  // still succeeds — see AuthService.register.
  const referralCode = String(form.get('referralCode') ?? '').trim().toUpperCase();

  let result: AuthResponse;
  try {
    result = await postAuth('register', {
      email: String(form.get('email') ?? '').trim().toLowerCase(),
      username,
      password: String(form.get('password') ?? ''),
      fullName: String(form.get('fullName') ?? ''),
      role,
      ...(phone ? { phone } : {}),
      ...(reraNumber ? { reraNumber } : {}),
      ...(referralCode ? { referralCode } : {}),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      const withFields = error as ApiError & { fieldErrors?: Record<string, string> };
      return { error: error.message, fieldErrors: withFields.fieldErrors };
    }
    return { error: 'Could not reach the server. Check your connection.' };
  }

  await setSessionCookies(result);

  /*
   * Everyone goes to phone verification first, then onward.
   *
   * A verified number is required before a seller can submit a listing, and
   * before a buyer can send an enquiry or ask for a site visit. Deferring it
   * means the person fills in a whole form and is stopped at the last step.
   * Asking immediately, while they are still in a sign-up frame of mind, is
   * both kinder and far more likely to be completed — it is one field.
   *
   * Buyers continue into a short run of preference questions afterwards. Every
   * one of those is skippable: someone who cannot reach a property listing
   * quickly leaves, and a preference extracted by force is worth less than no
   * preference at all.
   */
  const isSeller = result.user.role === 'OWNER' || result.user.role === 'BROKER';

  if (isSeller) {
    redirect('/seller/phone');
  }

  if (result.user.role === 'BUILDER') {
    redirect('/seller/projects');
  }

  redirect('/welcome/phone');
}

export async function signOut(): Promise<void> {
  await clearSessionCookies();
  redirect('/');
}

// ---------------------------------------------------------------------------
// Password reset and email verification
// ---------------------------------------------------------------------------

/**
 * These three actions post to endpoints that return a plain acknowledgement
 * rather than a session, so they cannot use `postAuth` — which insists on a
 * token pair coming back.
 */
async function postPlain(
  path: string,
  payload: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, message: 'Could not reach the server. Check your connection.' };
  }

  if (response.ok) {
    return { ok: true };
  }

  let message = 'Something went wrong. Try again.';
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) {
      message = body.message;
    }
  } catch {
    // Keep the generic message.
  }
  return { ok: false, message };
}

export interface ResetState extends FormState {
  sent?: boolean;
}

/**
 * Asks for a reset link.
 *
 * Reports success whatever happens, matching the API — which deliberately
 * answers identically for a registered and an unregistered address so the
 * endpoint cannot be used to discover who has an account. A UI that said
 * "no such user" would hand back exactly the information the API withholds.
 *
 * A genuine transport failure is still surfaced: "we could not reach the
 * server" tells an attacker nothing and tells an honest user something they
 * need to know.
 */
export async function requestPasswordReset(
  _prev: ResetState,
  form: FormData,
): Promise<ResetState> {
  const email = String(form.get('email') ?? '').trim();

  if (!email) {
    return { error: 'Enter the email address you signed up with.' };
  }

  const result = await postPlain('request-password-reset', { email });

  if (!result.ok && result.message.startsWith('Could not reach')) {
    return { error: result.message };
  }

  return { sent: true };
}

/**
 * Sets the new password.
 *
 * Succeeding here invalidates every existing session for the account, which the
 * page says plainly — someone resetting a password because they think it was
 * stolen needs to know the other sessions are gone.
 */
export async function resetPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get('token') ?? '');
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirmPassword') ?? '');

  if (!token) {
    return { error: 'This reset link is incomplete. Request a new one.' };
  }

  // Checked here rather than only server-side: the API has no second field to
  // compare against, and a typo should not cost someone another email.
  if (password !== confirm) {
    return { fieldErrors: { confirmPassword: 'Both passwords must match.' } };
  }

  const result = await postPlain('reset-password', { token, password });

  if (!result.ok) {
    return { error: result.message };
  }

  redirect('/login?reset=done');
}
