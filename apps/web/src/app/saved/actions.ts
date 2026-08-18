'use server';

import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/api';
import { serverApi } from '@/lib/server-api';
import { getAccessToken } from '@/lib/session';

export interface SaveState {
  saved: boolean;
  /** Set when the buyer is not signed in, so the UI can prompt rather than fail. */
  needsSignIn?: boolean;
  error?: string;
}

/**
 * Toggles a listing in the signed-in buyer's shortlist.
 *
 * A server action rather than a client fetch, so the session token stays in the
 * httpOnly cookie and never reaches the browser — the same rule the rest of the
 * app follows.
 */
export async function toggleSaved(
  listingId: string,
  currentlySaved: boolean,
): Promise<SaveState> {
  const token = await getAccessToken();
  if (!token) {
    // Not an error: browsing signed-out is normal and the PRD expects it. The
    // button turns into a sign-in prompt instead of showing a failure.
    return { saved: currentlySaved, needsSignIn: true };
  }

  try {
    const result = currentlySaved
      ? await serverApi.unsaveListing(listingId)
      : await serverApi.saveListing(listingId);

    // The shortlist page is server-rendered, so it has to be re-fetched after a
    // change made from anywhere else in the app.
    revalidatePath('/saved');
    return { saved: result.saved };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { saved: currentlySaved, needsSignIn: true };
    }
    if (error instanceof ApiError && error.status === 404) {
      return { saved: false, error: 'That home is no longer listed.' };
    }
    return { saved: currentlySaved, error: 'Could not update your saved homes.' };
  }
}
