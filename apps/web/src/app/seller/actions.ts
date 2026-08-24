'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi } from '@/lib/server-api';

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: string;
}

/** Pulls the API's field-level validation detail into a form-friendly shape. */
function toState(error: unknown, fallback: string): ActionState {
  if (error instanceof ApiError) {
    const withFields = error as ApiError & {
      fieldErrors?: Array<{ field: string; message: string }>;
    };
    const fieldErrors: Record<string, string> = {};
    for (const issue of withFields.fieldErrors ?? []) {
      fieldErrors[issue.field] ??= issue.message;
    }
    return {
      error: error.message,
      fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    };
  }
  return { error: fallback };
}

function num(form: FormData, key: string): number | undefined {
  const raw = form.get(key);
  if (raw === null || String(raw).trim() === '') {
    return undefined;
  }
  const parsed = Number(String(raw));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Optional enum/text field: absent and empty both mean "not answered". */
function str(form: FormData, key: string): string | undefined {
  const raw = form.get(key);
  if (raw === null) {
    return undefined;
  }
  const value = String(raw).trim();
  return value === '' ? undefined : value;
}

/**
 * Builds the optional half of the payload.
 *
 * Optional fields are omitted entirely when unanswered rather than sent as
 * null, because the API treats an absent key as "leave alone" and an explicit
 * null as "clear this" — sending null from a create would be harmless, but the
 * same helper is used by the edit path where the difference matters.
 */
function optionalPropertyFields(form: FormData): Record<string, unknown> {
  const numeric = [
    'carpetAreaSqft',
    'balconies',
    'floor',
    'totalFloors',
    'coveredParking',
    'openParking',
    'yearBuilt',
  ] as const;

  const enums = ['furnishing', 'facing', 'ownership', 'approvingAuthority'] as const;

  const payload: Record<string, unknown> = {};

  for (const key of numeric) {
    const value = num(form, key);
    if (value !== undefined) {
      payload[key] = value;
    }
  }

  for (const key of enums) {
    const value = str(form, key);
    if (value !== undefined) {
      payload[key] = value;
    }
  }

  // Checkbox groups arrive as repeated keys; getAll collapses them to a list.
  const amenities = form.getAll('amenities').map(String).filter(Boolean);
  if (amenities.length > 0) {
    payload.amenities = amenities;
  }

  return payload;
}

export async function createListing(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const payload = {
    title: String(form.get('title') ?? '').trim(),
    description: String(form.get('description') ?? '').trim(),
    price: num(form, 'price'),
    priceNegotiable: form.get('priceNegotiable') === 'on',
    address: String(form.get('address') ?? '').trim(),
    pincode: String(form.get('pincode') ?? '').trim(),
    neighborhoodId: String(form.get('neighborhoodId') ?? ''),
    propertyType: String(form.get('propertyType') ?? 'FLAT'),
    bedrooms: num(form, 'bedrooms'),
    bathrooms: num(form, 'bathrooms'),
    areaSqft: num(form, 'areaSqft'),
    possession: String(form.get('possession') ?? 'READY_TO_MOVE'),
    contactPreference: String(form.get('contactPreference') ?? 'ANY'),
    ...optionalPropertyFields(form),
  };

  let created: { id: string };
  try {
    created = await serverApi.createListing(payload);
  } catch (error) {
    return toState(error, 'Could not save the listing. Try again.');
  }

  revalidatePath('/seller/listings');
  // Straight to the detail page, which is where photos and documents are added.
  redirect(`/seller/listings/${created.id}`);
}

/**
 * Uploads one or more photographs.
 *
 * The API takes a single file per request, so several are sent in sequence
 * rather than in parallel: the endpoint enforces a maximum photo count, and
 * concurrent requests would each read the count before any had written, letting
 * a batch slip past the limit.
 *
 * A failure part-way through keeps the photos that already succeeded and says
 * how far it got. Discarding them would be worse — the seller would have no way
 * to tell which ones to try again.
 */
export async function uploadPhoto(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const listingId = String(form.get('listingId') ?? '');
  const files = form
    .getAll('file')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) {
    return { error: 'Choose at least one photo to upload.' };
  }

  let uploaded = 0;
  for (const file of files) {
    const upload = new FormData();
    upload.set('file', file);

    try {
      await serverApi.uploadPhoto(listingId, upload);
      uploaded += 1;
    } catch (error) {
      revalidatePath(`/seller/listings/${listingId}`);
      const failure = toState(error, `Could not upload ${file.name}.`);
      return {
        ...failure,
        ...(uploaded > 0 && {
          error: `${failure.error ?? 'Upload failed.'} ${uploaded} of ${files.length} were added.`,
        }),
      };
    }
  }

  revalidatePath(`/seller/listings/${listingId}`);
  return { ok: uploaded === 1 ? 'Photo added.' : `${uploaded} photos added.` };
}

/**
 * Sets photo display order. The first photo becomes the cover.
 *
 * Sends the complete order rather than a single move, matching the API: a
 * "move up" call has to be applied against the client's assumed order, and two
 * quick clicks race into an order nobody intended.
 */
export async function reorderPhotos(
  listingId: string,
  order: string[],
): Promise<ActionState> {
  try {
    await serverApi.reorderPhotos(listingId, order);
  } catch (error) {
    return toState(error, 'Could not change the photo order.');
  }

  revalidatePath(`/seller/listings/${listingId}`);
  return { ok: 'Photo order updated.' };
}

export async function uploadDocument(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const listingId = String(form.get('listingId') ?? '');
  const kind = String(form.get('kind') ?? '');
  const idProofKind = String(form.get('idProofKind') ?? '').trim() || undefined;
  const file = form.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a document to upload.' };
  }

  const upload = new FormData();
  upload.set('file', file);

  try {
    await serverApi.uploadDocument(listingId, kind, idProofKind, upload);
  } catch (error) {
    return toState(error, 'Could not upload that document.');
  }

  revalidatePath(`/seller/listings/${listingId}`);
  return { ok: 'Document uploaded and encrypted.' };
}

export async function submitForReview(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const listingId = String(form.get('listingId') ?? '');

  try {
    await serverApi.submitListing(listingId);
  } catch (error) {
    return toState(error, 'Could not submit for review.');
  }

  revalidatePath(`/seller/listings/${listingId}`);
  revalidatePath('/seller/listings');
  return { ok: 'Submitted. An officer will review your documents.' };
}

export async function confirmStillAvailable(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const listingId = String(form.get('listingId') ?? '');

  try {
    await serverApi.confirmAvailability(listingId);
  } catch (error) {
    return toState(error, 'Could not record that.');
  }

  revalidatePath(`/seller/listings/${listingId}`);
  revalidatePath('/seller/listings');
  return { ok: 'Thanks — buyers can see this is still available.' };
}

export async function pauseListing(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const listingId = String(form.get('listingId') ?? '');
  const reason = String(form.get('reason') ?? '').trim();

  try {
    await serverApi.pauseListing(listingId, reason || undefined);
  } catch (error) {
    return toState(error, 'Could not pause the listing.');
  }

  revalidatePath(`/seller/listings/${listingId}`);
  revalidatePath('/seller/listings');
  return { ok: 'Paused. Buyers can no longer see it, and you can put it back any time.' };
}

export async function resumeListing(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const listingId = String(form.get('listingId') ?? '');

  try {
    await serverApi.resumeListing(listingId);
  } catch (error) {
    return toState(error, 'Could not put the listing back.');
  }

  revalidatePath(`/seller/listings/${listingId}`);
  revalidatePath('/seller/listings');
  return { ok: 'Back in front of buyers. No second review was needed.' };
}

/**
 * Records a sale.
 *
 * Both details are optional, and the empty string has to become `undefined`
 * rather than 0 — a seller who skips the price has not sold for nothing.
 */
export async function markListingSold(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const listingId = String(form.get('listingId') ?? '');

  const rawPrice = String(form.get('soldPrice') ?? '').trim();
  const soldPrice = rawPrice ? Number(rawPrice) : undefined;

  if (soldPrice !== undefined && (!Number.isFinite(soldPrice) || soldPrice <= 0)) {
    return { error: 'That sale price could not be read. Leave it blank if you would rather not say.' };
  }

  const throughPlatform = String(form.get('soldThroughPlatform') ?? '');

  try {
    await serverApi.markListingSold(listingId, {
      ...(soldPrice !== undefined && { soldPrice: Math.round(soldPrice) }),
      ...(throughPlatform && { soldThroughPlatform: throughPlatform === 'yes' }),
    });
  } catch (error) {
    return toState(error, 'Could not record the sale.');
  }

  revalidatePath(`/seller/listings/${listingId}`);
  revalidatePath('/seller/listings');
  return { ok: 'Recorded. The listing is off the market and anyone waiting on a visit has been told.' };
}

export async function setLeadStatus(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const leadId = String(form.get('leadId') ?? '');
  const status = String(form.get('status') ?? '');

  try {
    await serverApi.updateLeadStatus(leadId, status);
  } catch (error) {
    return toState(error, 'Could not update that enquiry.');
  }

  revalidatePath('/seller/leads');
  return { ok: 'Updated.' };
}
