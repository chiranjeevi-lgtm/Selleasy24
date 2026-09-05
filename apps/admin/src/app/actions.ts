'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminApi, ApiError } from '@/lib/api';
import { clearSessionCookies, setSessionCookies, type TokenPair } from '@/lib/session';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: string;
}

const STAFF_ROLES = new Set(['VERIFIER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']);

function toState(error: unknown, fallback: string): ActionState {
  if (error instanceof ApiError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.fieldErrors ?? []) {
      fieldErrors[issue.field] ??= issue.message;
    }
    return {
      error: error.message,
      fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    };
  }
  return { error: fallback };
}

export async function signIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Accept email or username; the API decides by presence of '@'.
      identifier: String(form.get('identifier') ?? form.get('email') ?? '')
        .trim()
        .toLowerCase(),
      password: String(form.get('password') ?? ''),
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    let message = 'Could not sign in.';
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* keep default */
    }
    return { error: message };
  }

  const result = (await response.json()) as TokenPair & { user: { role: string } };

  /**
   * Staff-only door.
   *
   * A seller's credentials are valid at the API, so without this check they could
   * sign in here and see a console shell before every request failed with 403.
   * Refusing at the door is clearer, and it keeps the console from looking like
   * something a seller was ever meant to reach.
   *
   * This is a usability guard, not the security boundary — the API enforces roles
   * on every endpoint independently.
   */
  if (!STAFF_ROLES.has(result.user.role)) {
    return { error: 'This console is for verification staff. Use the main site to sign in.' };
  }

  await setSessionCookies(result);
  redirect('/queue');
}

export async function signOut(): Promise<void> {
  await clearSessionCookies();
  redirect('/login');
}

/**
 * Records a verification decision.
 *
 * Check results are collected from the form as `check:<KIND>` values so the set
 * of checks is driven by the rendered panel rather than by a hardcoded list here.
 */
export async function submitDecision(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const listingId = String(form.get('listingId') ?? '');
  const decision = String(form.get('decision') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  const internalNotes = String(form.get('internalNotes') ?? '').trim();

  const checks: Array<{ kind: string; passed: boolean; note?: string }> = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('check:')) continue;
    const kind = key.slice('check:'.length);
    const state = String(value);
    // 'skip' means the check was not applicable and is deliberately not recorded.
    if (state === 'skip') continue;
    const note = String(form.get(`note:${kind}`) ?? '').trim();
    checks.push({ kind, passed: state === 'pass', ...(note ? { note } : {}) });
  }

  try {
    await adminApi.decide(listingId, {
      decision,
      ...(reason ? { reason } : {}),
      ...(internalNotes ? { internalNotes } : {}),
      checks,
    });
  } catch (error) {
    return toState(error, 'Could not record the decision.');
  }

  revalidatePath('/queue');
  revalidatePath(`/review/${listingId}`);
  redirect('/queue');
}

/**
 * Records a decision on a builder project.
 *
 * Same `check:<KIND>` collection as the listing decision. Which checks are
 * mandatory depends on the project's stage and is enforced by the API — the
 * form only renders the rows the API told it were required.
 */
export async function submitProjectDecision(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const projectId = String(form.get('projectId') ?? '');
  const decision = String(form.get('decision') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  const internalNotes = String(form.get('internalNotes') ?? '').trim();

  const checks: Array<{ kind: string; passed: boolean; note?: string }> = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('check:')) continue;
    const kind = key.slice('check:'.length);
    const state = String(value);
    // 'skip' means not applicable and is deliberately not recorded.
    if (state === 'skip') continue;
    const note = String(form.get(`note:${kind}`) ?? '').trim();
    checks.push({ kind, passed: state === 'pass', ...(note ? { note } : {}) });
  }

  try {
    await adminApi.decideProject(projectId, {
      decision,
      ...(reason ? { reason } : {}),
      ...(internalNotes ? { internalNotes } : {}),
      checks,
    });
  } catch (error) {
    return toState(error, 'Could not record the decision.');
  }

  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  redirect('/projects');
}

export async function resolveReport(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const reportId = String(form.get('reportId') ?? '');

  try {
    await adminApi.resolveReport(reportId, {
      status: String(form.get('status') ?? 'RESOLVED'),
      resolutionNote: String(form.get('resolutionNote') ?? '').trim(),
    });
  } catch (error) {
    return toState(error, 'Could not update the report.');
  }

  revalidatePath('/reports');
  return { ok: 'Report updated. The reporter can now see the outcome.' };
}
