'use server';

import { ApiError, type FieldAgentApplicationInput } from '@/lib/api';
import { setSessionCookies } from '@/lib/session';

/**
 * Agent application — server action.
 *
 * Kept as a server action rather than a browser fetch because the
 * response includes a token pair that must land in httpOnly cookies. The
 * browser must never see access/refresh tokens directly; see
 * `apps/web/src/lib/session.ts` for the rationale that applies here too.
 *
 * Returned to the client so the form can render the same three visible
 * states as before (success / conflict / error) with useful messages,
 * plus a fourth "next page ready" that carries the location for the
 * client to navigate. Doing the redirect in the action would work but
 * would eat the success screen — the transition is nicer if the client
 * decides when to move.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type AgentApplyResult =
  | { kind: 'success'; email: string; redirectTo: string }
  | { kind: 'conflict' }
  | { kind: 'rate_limited' }
  | { kind: 'error'; message: string };

export async function applyAsAgent(
  input: FieldAgentApplicationInput,
): Promise<AgentApplyResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/field-agents/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      cache: 'no-store',
    });
  } catch {
    return {
      kind: 'error',
      message: 'Could not reach the server. Check your connection and try again.',
    };
  }

  if (response.status === 409) {
    return { kind: 'conflict' };
  }
  if (response.status === 429) {
    return { kind: 'rate_limited' };
  }
  if (!response.ok) {
    let message = 'Something went wrong. Try again in a moment.';
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Keep the generic message.
    }
    return { kind: 'error', message };
  }

  let body: {
    fieldAgent: { id: string; status: string };
    user: { id: string; email: string; role: string };
    tokens: { accessToken: string; refreshToken: string; expiresIn: number };
  };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return {
      kind: 'error',
      message: 'The server responded but the payload was malformed. Try again.',
    };
  }

  await setSessionCookies(body.tokens);

  return {
    kind: 'success',
    email: body.user.email,
    redirectTo: '/agent/status',
  };
}

/**
 * Signed-in variant — used from an in-app "Also become an agent" CTA (not
 * yet wired). Kept here as a placeholder so the existing user path has a
 * defined shape whenever we surface a link to it.
 */
export async function applyAsAgentSignedIn(
  input: Omit<FieldAgentApplicationInput, 'email' | 'password'>,
): Promise<{ kind: 'success' } | { kind: 'error'; message: string }> {
  const { getAccessToken } = await import('@/lib/session');
  const token = await getAccessToken();
  if (!token) {
    return { kind: 'error', message: 'You need to be signed in to use this endpoint.' };
  }
  try {
    const response = await fetch(`${API_BASE}/api/field-agents/me/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      throw new ApiError(response.status, body.message ?? 'Application failed.');
    }
    return { kind: 'success' };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Application failed.',
    };
  }
}
