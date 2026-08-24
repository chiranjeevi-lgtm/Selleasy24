'use server';

import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/api';
import { serverApi } from '@/lib/server-api';

export interface VisitState {
  ok?: string;
  error?: string;
}

/**
 * The seller confirms, proposes another time, or declines.
 *
 * Declining requires a reason, enforced by the API. A request that simply goes
 * quiet is the complaint buyers make most often about the incumbent portals,
 * and it costs nothing to say "it is under offer" instead.
 */
export async function respondToVisit(
  _prev: VisitState,
  form: FormData,
): Promise<VisitState> {
  const id = String(form.get('requestId') ?? '');
  const decision = String(form.get('decision') ?? '');

  const date = String(form.get('date') ?? '').trim();
  const time = String(form.get('time') ?? '').trim();

  let proposedAt: string | undefined;
  if (date && time) {
    const when = new Date(`${date}T${time}`);
    if (Number.isNaN(when.getTime())) {
      return { error: 'That date and time could not be read.' };
    }
    proposedAt = when.toISOString();
  }

  if (decision === 'RESCHEDULE' && !proposedAt) {
    return { error: 'Suggest a date and time when asking to reschedule.' };
  }

  const sellerNote = String(form.get('sellerNote') ?? '').trim();
  if (decision === 'DECLINE' && !sellerNote) {
    return { error: 'Tell the buyer why, even briefly.' };
  }

  try {
    await serverApi.respondToSiteVisit(id, {
      decision,
      ...(proposedAt && { proposedAt }),
      ...(sellerNote && { sellerNote }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Could not send your response. Try again.' };
  }

  revalidatePath('/seller/visits');
  return {
    ok:
      decision === 'CONFIRM'
        ? 'Confirmed. The buyer has been told.'
        : decision === 'RESCHEDULE'
          ? 'New time suggested. The buyer will confirm.'
          : 'Declined, and the buyer knows why.',
  };
}
