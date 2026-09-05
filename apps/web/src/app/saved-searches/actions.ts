'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi } from '@/lib/server-api';

/**
 * Delete + toggle-alerts server actions for /saved-searches.
 *
 * void-returning because Next.js form-action prop only accepts that
 * shape. Errors surface via a `?error=` query param; success revalidates
 * the page.
 */

function errorRedirect(message: string): never {
  redirect(`/saved-searches?error=${encodeURIComponent(message.slice(0, 160))}`);
}

export async function deleteSavedSearch(id: string): Promise<void> {
  try {
    await serverApi.deleteSavedSearch(id);
  } catch (error) {
    if (error instanceof ApiError) errorRedirect(error.message);
    errorRedirect('Something went wrong deleting that search.');
  }
  revalidatePath('/saved-searches');
}

export async function toggleAlerts(id: string, alertsEnabled: boolean): Promise<void> {
  try {
    await serverApi.toggleSavedSearchAlerts(id, alertsEnabled);
  } catch (error) {
    if (error instanceof ApiError) errorRedirect(error.message);
    errorRedirect('Could not update the alert setting.');
  }
  revalidatePath('/saved-searches');
}

/**
 * Save-search action called from the homepage results row. Reads the
 * current URL query string from a hidden input on the form and stores it
 * verbatim. Name defaults to a compact summary if the user didn't type one.
 */
export async function createSavedSearch(formData: FormData): Promise<void> {
  const queryString = String(formData.get('queryString') ?? '').trim();
  const nameRaw = String(formData.get('name') ?? '').trim();
  if (!queryString) errorRedirect('Nothing to save — apply at least one filter first.');

  // Generate a fallback name from the filters if the buyer didn't provide
  // one — "3 BHK · Kondapur · Under 1.5 Cr" beats "Search #7".
  const name = nameRaw.length > 0 ? nameRaw : summariseQuery(queryString);

  try {
    await serverApi.createSavedSearch({ name, queryString, alertsEnabled: false });
  } catch (error) {
    if (error instanceof ApiError) errorRedirect(error.message);
    errorRedirect('Could not save that search.');
  }
  redirect('/saved-searches?saved=1');
}

function summariseQuery(qs: string): string {
  const p = new URLSearchParams(qs);
  const parts: string[] = [];
  const bhk = p.get('bedrooms');
  if (bhk) parts.push(`${bhk} BHK`);
  const type = p.get('propertyType');
  if (type) parts.push(type.toLowerCase());
  const maxPrice = p.get('maxPrice');
  if (maxPrice) {
    const n = Number(maxPrice);
    if (Number.isFinite(n)) {
      parts.push(n >= 10_000_000 ? `Under ₹${(n / 10_000_000).toFixed(1)}Cr` : `Under ₹${(n / 100_000).toFixed(0)}L`);
    }
  }
  if (parts.length === 0) return 'Saved search';
  return parts.join(' · ').slice(0, 120);
}
