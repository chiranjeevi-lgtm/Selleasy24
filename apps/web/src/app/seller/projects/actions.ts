'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi } from '@/lib/server-api';

export interface ProjectActionState {
  ok?: string;
  error?: string;
  /** Field-level messages from the API, keyed by field name. */
  fields?: Record<string, string>;
}

/** Pulls the API's field errors into a shape the form can attach to inputs. */
function toState(error: unknown, fallback: string): ProjectActionState {
  if (error instanceof ApiError) {
    const fieldErrors = (error as ApiError & {
      fieldErrors?: Array<{ field: string; message: string }>;
    }).fieldErrors;

    if (fieldErrors?.length) {
      const fields: Record<string, string> = {};
      for (const item of fieldErrors) {
        // First message per field wins; a list of three under one input is
        // noise rather than help.
        fields[item.field] ??= item.message;
      }
      return { error: error.message, fields };
    }

    return { error: error.message };
  }

  return { error: fallback };
}

function optionalNumber(form: FormData, key: string): number | undefined {
  const raw = String(form.get(key) ?? '').trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Creates the project shell.
 *
 * Configurations, photos and documents come afterwards on the project's own
 * page. Asking for all of it in one form is how a builder abandons the process
 * halfway through with nothing saved.
 */
export async function createProject(
  _prev: ProjectActionState,
  form: FormData,
): Promise<ProjectActionState> {
  const stage = String(form.get('stage') ?? '');
  const possessionDate = String(form.get('possessionDate') ?? '').trim();
  const deliveredOn = String(form.get('deliveredOn') ?? '').trim();

  const payload = {
    name: String(form.get('name') ?? '').trim(),
    description: String(form.get('description') ?? '').trim(),
    address: String(form.get('address') ?? '').trim(),
    pincode: String(form.get('pincode') ?? '').trim(),
    neighborhoodId: String(form.get('neighborhoodId') ?? ''),
    stage,
    reraNumber: String(form.get('reraNumber') ?? '').trim(),
    ...(possessionDate && { possessionDate }),
    ...(deliveredOn && { deliveredOn }),
    ...(form.get('approvingAuthority') && {
      approvingAuthority: String(form.get('approvingAuthority')),
    }),
    ...(optionalNumber(form, 'totalTowers') !== undefined && {
      totalTowers: optionalNumber(form, 'totalTowers'),
    }),
    ...(optionalNumber(form, 'totalUnits') !== undefined && {
      totalUnits: optionalNumber(form, 'totalUnits'),
    }),
    ...(optionalNumber(form, 'landAreaAcres') !== undefined && {
      landAreaAcres: optionalNumber(form, 'landAreaAcres'),
    }),
    amenities: form.getAll('amenities').map(String),
  };

  let created: { id: string };
  try {
    created = await serverApi.createProject(payload);
  } catch (error) {
    return toState(error, 'Could not create the project. Try again.');
  }

  // Outside the try: redirect throws internally, and catching it here would
  // turn a successful create into an error message.
  redirect(`/seller/projects/${created.id}`);
}

/**
 * Replaces the configuration set.
 *
 * The whole set is sent because rows are added and removed freely in the form,
 * and a per-row API would need the client to track ids across that.
 */
export async function saveUnits(
  _prev: ProjectActionState,
  form: FormData,
): Promise<ProjectActionState> {
  const projectId = String(form.get('projectId') ?? '');

  const bedrooms = form.getAll('bedrooms').map(String);
  const bathrooms = form.getAll('bathrooms').map(String);
  const areas = form.getAll('areaSqft').map(String);
  const carpets = form.getAll('carpetAreaSqft').map(String);
  const prices = form.getAll('priceFrom').map(String);
  const totals = form.getAll('totalUnits').map(String);
  const availables = form.getAll('availableUnits').map(String);

  const units = bedrooms
    .map((_, index) => ({
      bedrooms: Number(bedrooms[index]),
      bathrooms: Number(bathrooms[index]),
      areaSqft: Number(areas[index]),
      ...(carpets[index]?.trim() && { carpetAreaSqft: Number(carpets[index]) }),
      priceFrom: Number(prices[index]),
      ...(totals[index]?.trim() && { totalUnits: Number(totals[index]) }),
      ...(availables[index]?.trim() && { availableUnits: Number(availables[index]) }),
    }))
    // A row where the required numbers were left blank is an empty row the
    // builder did not fill in, not an attempt to send zeros.
    .filter(
      (unit) =>
        Number.isFinite(unit.bedrooms) &&
        Number.isFinite(unit.areaSqft) &&
        Number.isFinite(unit.priceFrom),
    );

  if (units.length === 0) {
    return { error: 'Add at least one configuration.' };
  }

  try {
    await serverApi.setProjectUnits(projectId, units);
  } catch (error) {
    return toState(error, 'Could not save the configurations. Try again.');
  }

  revalidatePath(`/seller/projects/${projectId}`);
  return { ok: `Saved ${units.length} ${units.length === 1 ? 'configuration' : 'configurations'}.` };
}

export async function submitProject(
  _prev: ProjectActionState,
  form: FormData,
): Promise<ProjectActionState> {
  const projectId = String(form.get('projectId') ?? '');

  try {
    await serverApi.submitProject(projectId);
  } catch (error) {
    return toState(error, 'Could not submit the project. Try again.');
  }

  revalidatePath(`/seller/projects/${projectId}`);
  revalidatePath('/seller/projects');
  return { ok: 'Submitted. An officer usually decides within 24 hours.' };
}

/**
 * Photo and document uploads.
 *
 * Both take one file per call so a failure names the file that failed. The form
 * accepts several and this runs once per file.
 */
export async function uploadProjectPhoto(
  _prev: ProjectActionState,
  form: FormData,
): Promise<ProjectActionState> {
  const projectId = String(form.get('projectId') ?? '');
  const isRender = form.get('isRender') === 'on';
  const files = form.getAll('file').filter((entry): entry is File => entry instanceof File);

  const real = files.filter((file) => file.size > 0);
  if (real.length === 0) {
    return { error: 'Choose at least one photo.' };
  }

  const failures: string[] = [];
  for (const file of real) {
    const single = new FormData();
    single.set('file', file);
    try {
      await serverApi.uploadProjectPhoto(projectId, isRender, single);
    } catch (error) {
      failures.push(
        `${file.name}: ${error instanceof ApiError ? error.message : 'upload failed'}`,
      );
    }
  }

  revalidatePath(`/seller/projects/${projectId}`);

  if (failures.length === real.length) {
    return { error: failures[0] };
  }
  if (failures.length > 0) {
    return {
      ok: `Uploaded ${real.length - failures.length} of ${real.length}.`,
      error: failures.join(' '),
    };
  }
  return { ok: `Uploaded ${real.length} ${real.length === 1 ? 'photo' : 'photos'}.` };
}

export async function uploadProjectDocument(
  _prev: ProjectActionState,
  form: FormData,
): Promise<ProjectActionState> {
  const projectId = String(form.get('projectId') ?? '');
  const kind = String(form.get('kind') ?? '');
  const file = form.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a file.' };
  }

  const single = new FormData();
  single.set('file', file);

  try {
    await serverApi.uploadProjectDocument(projectId, kind, single);
  } catch (error) {
    return toState(error, 'Could not upload the document. Try again.');
  }

  revalidatePath(`/seller/projects/${projectId}`);
  return { ok: 'Uploaded.' };
}
