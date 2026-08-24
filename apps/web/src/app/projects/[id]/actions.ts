'use server';

import { ApiError } from '@/lib/api';
import { serverApi } from '@/lib/server-api';

export interface ProjectEnquiryState {
  ok?: string;
  error?: string;
  /** Set when the session has gone, so the panel can offer a way back in. */
  needsSignIn?: boolean;
}

/**
 * Contacting the builder.
 *
 * Requires an account, exactly as a listing enquiry does. On a platform whose
 * whole proposition is that both sides have been checked, an anonymous enquiry
 * was the weakest link — and a builder's sales team fields enough cold calls
 * without us adding to them.
 */
export async function sendProjectEnquiry(
  _prev: ProjectEnquiryState,
  form: FormData,
): Promise<ProjectEnquiryState> {
  const projectId = String(form.get('projectId') ?? '');
  const name = String(form.get('name') ?? '').trim();
  const phone = String(form.get('phone') ?? '').trim();
  const message = String(form.get('message') ?? '').trim();
  const projectUnitId = String(form.get('projectUnitId') ?? '').trim();

  if (!name || !phone) {
    return { error: 'We need a name and a number to pass on.' };
  }

  try {
    await serverApi.sendProjectEnquiry(projectId, {
      name,
      phone,
      ...(message && { message }),
      // The empty string is the "any configuration" option, not a selection.
      ...(projectUnitId && { projectUnitId }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) {
        return { needsSignIn: true };
      }
      return { error: error.message };
    }
    return { error: 'Could not send that. Try again.' };
  }

  return {
    ok: 'Sent. The builder has your details and will be in touch — your number goes to them and nobody else.',
  };
}
