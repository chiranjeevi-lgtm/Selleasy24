'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminApi, ApiError } from '@/lib/api';

/**
 * Field-agent moderation server actions.
 *
 * Return type is `void | Promise<void>` because Next.js form-action prop
 * requires that shape — you cannot return a structured result the way
 * useActionState hooks accept. Errors surface via a `?error=` query param
 * on the redirected URL, which the page picks up and renders as a banner.
 * A future refactor to `useActionState` in a client wrapper would allow
 * richer field-level feedback; for now, URL-param is the pragmatic path.
 */

function encodeError(msg: string): string {
  // Cap at 200 chars so URL doesn't blow up on a Prisma stack trace.
  return `/field-agents?error=${encodeURIComponent(msg.slice(0, 200))}`;
}

export async function activateAgent(agentId: string): Promise<void> {
  try {
    await adminApi.activateFieldAgent(agentId);
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(encodeError(error.message));
    }
    redirect(encodeError('Something went wrong. Try again.'));
  }
  revalidatePath('/field-agents');
}

export async function suspendAgent(
  agentId: string,
  formData: FormData,
): Promise<void> {
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 10) {
    redirect(encodeError('Reason must be at least 10 characters.'));
  }

  try {
    await adminApi.suspendFieldAgent(agentId, reason);
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(encodeError(error.message));
    }
    redirect(encodeError('Something went wrong. Try again.'));
  }
  revalidatePath('/field-agents');
}
