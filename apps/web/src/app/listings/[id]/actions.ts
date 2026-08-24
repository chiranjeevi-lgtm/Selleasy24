'use server';

import { ApiError } from '@/lib/api';
import { serverApi } from '@/lib/server-api';
import { getAccessToken } from '@/lib/session';

export interface ContactState {
  ok?: string;
  error?: string;
  /** Set when there is no session, so the form can prompt instead of failing. */
  needsSignIn?: boolean;
  fieldErrors?: Record<string, string>;
}

/**
 * Both actions run on the server so the session token stays in its httpOnly
 * cookie. The previous version called the API straight from the browser, which
 * worked only while these endpoints were open to anyone — the token cannot be
 * read by client JavaScript, and the API is a different origin, so the cookie
 * would not travel with the request either.
 */

export async function sendEnquiry(
  _prev: ContactState,
  form: FormData,
): Promise<ContactState> {
  const listingId = String(form.get('listingId') ?? '');

  if (!(await getAccessToken())) {
    return { needsSignIn: true };
  }

  const payload = {
    name: String(form.get('name') ?? '').trim(),
    phone: String(form.get('phone') ?? '').trim(),
    email: String(form.get('email') ?? '').trim() || undefined,
    message: String(form.get('message') ?? '').trim() || undefined,
  };

  try {
    await serverApi.sendEnquiry(listingId, payload);
  } catch (error) {
    return toContactState(error, 'Could not send your enquiry. Try again.');
  }

  return { ok: 'Sent. The owner has your details and will be in touch.' };
}

export async function requestSiteVisit(
  _prev: ContactState,
  form: FormData,
): Promise<ContactState> {
  const listingId = String(form.get('listingId') ?? '');

  if (!(await getAccessToken())) {
    return { needsSignIn: true };
  }

  const date = String(form.get('date') ?? '').trim();
  const time = String(form.get('time') ?? '').trim();

  if (!date || !time) {
    return { error: 'Choose a date and a time.' };
  }

  /*
   * Combined and sent as an ISO timestamp. The two inputs are split only
   * because a native date picker and time picker are far easier on a phone
   * than a single datetime field.
   */
  const preferredAt = new Date(`${date}T${time}`);
  if (Number.isNaN(preferredAt.getTime())) {
    return { error: 'That date and time could not be read.' };
  }

  try {
    await serverApi.requestSiteVisit(listingId, {
      preferredAt: preferredAt.toISOString(),
      note: String(form.get('note') ?? '').trim() || undefined,
    });
  } catch (error) {
    return toContactState(error, 'Could not send your request. Try again.');
  }

  return { ok: 'Requested. The owner will confirm, suggest another time, or let you know if it is not possible.' };
}

function toContactState(error: unknown, fallback: string): ContactState {
  if (error instanceof ApiError) {
    // A session that expired between page load and submit.
    if (error.status === 401) {
      return { needsSignIn: true };
    }

    const withFields = error as ApiError & {
      fieldErrors?: Array<{ field: string; message: string }>;
    };
    const fieldErrors: Record<string, string> = {};
    for (const issue of withFields.fieldErrors ?? []) {
      fieldErrors[issue.field] ??= issue.message;
    }

    return {
      error: error.message,
      ...(Object.keys(fieldErrors).length > 0 && { fieldErrors }),
    };
  }
  return { error: fallback };
}
