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
  return role === 'OWNER' || role === 'BROKER' ? '/seller/listings' : '/';
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
      email: String(form.get('email') ?? ''),
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

  let result: AuthResponse;
  try {
    result = await postAuth('register', {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      fullName: String(form.get('fullName') ?? ''),
      role,
      ...(phone ? { phone } : {}),
      ...(reraNumber ? { reraNumber } : {}),
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
   * Sellers go to phone verification, not to their (empty) dashboard.
   *
   * A verified number is required before a listing can be submitted, so
   * deferring it just means the seller fills in a whole listing and is stopped
   * at the last step. Asking immediately, while they are still in a sign-up
   * frame of mind, is both kinder and far more likely to be completed.
   *
   * Buyers are not asked: they can browse, compare, shortlist and enquire
   * without a phone number at all.
   */
  const isSeller = result.user.role === 'OWNER' || result.user.role === 'BROKER';
  redirect(isSeller ? '/seller/phone' : safeRedirectTarget(undefined, result.user.role));
}

export async function signOut(): Promise<void> {
  await clearSessionCookies();
  redirect('/');
}
