'use server';

import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { serverApi } from '@/lib/server-api';
import { nextHref } from './steps';

export interface StepState {
  error?: string;
  fields?: Record<string, string>;
}

function toState(error: unknown, fallback: string): StepState {
  if (error instanceof ApiError) {
    const fieldErrors = (error as ApiError & {
      fieldErrors?: Array<{ field: string; message: string }>;
    }).fieldErrors;

    if (fieldErrors?.length) {
      const fields: Record<string, string> = {};
      for (const item of fieldErrors) {
        fields[item.field] ??= item.message;
      }
      return { error: error.message, fields };
    }
    return { error: error.message };
  }
  return { error: fallback };
}

/**
 * Rupee amounts arrive as lakhs or crores from the sliders and as plain rupees
 * from a typed field, so the unit travels with the value rather than being
 * assumed here.
 */
function rupees(form: FormData, key: string): number | undefined {
  const raw = String(form.get(key) ?? '').trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

function optionalInt(form: FormData, key: string): number | undefined {
  const raw = String(form.get(key) ?? '').trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

export async function savePurpose(_prev: StepState, form: FormData): Promise<StepState> {
  const purpose = String(form.get('purpose') ?? '');
  if (!purpose) {
    return { error: 'Pick one so we know what to look for.' };
  }

  try {
    await serverApi.saveBuyerPurpose({
      purpose,
      ...(optionalInt(form, 'householdSize') !== undefined && {
        householdSize: optionalInt(form, 'householdSize'),
      }),
      ...(optionalInt(form, 'bedroomsWanted') !== undefined && {
        bedroomsWanted: optionalInt(form, 'bedroomsWanted'),
      }),
    });
  } catch (error) {
    return toState(error, 'Could not save that. Try again.');
  }

  redirect(nextHref('purpose'));
}

export async function saveBudget(_prev: StepState, form: FormData): Promise<StepState> {
  const budgetMin = rupees(form, 'budgetMin');
  const budgetMax = rupees(form, 'budgetMax');

  // Caught here as well as by the API so the buyer is told before a round trip.
  if (budgetMin !== undefined && budgetMax !== undefined && budgetMin > budgetMax) {
    return { error: 'The most you would spend has to be at least the least.' };
  }

  try {
    await serverApi.saveBuyerBudget({
      ...(budgetMin !== undefined && { budgetMin }),
      ...(budgetMax !== undefined && { budgetMax }),
      ...(rupees(form, 'monthlyIncome') !== undefined && {
        monthlyIncome: rupees(form, 'monthlyIncome'),
      }),
    });
  } catch (error) {
    return toState(error, 'Could not save that. Try again.');
  }

  redirect(nextHref('budget'));
}

export async function saveAreas(_prev: StepState, form: FormData): Promise<StepState> {
  const neighborhoodIds = form.getAll('neighborhoodIds').map(String).filter(Boolean);

  try {
    await serverApi.saveBuyerLocalities({ neighborhoodIds });
  } catch (error) {
    return toState(error, 'Could not save those areas. Try again.');
  }

  redirect(nextHref('areas'));
}

/** The last step. Saving it marks the run finished. */
export async function saveAbout(_prev: StepState, form: FormData): Promise<StepState> {
  const occupation = String(form.get('occupation') ?? '').trim();

  try {
    await serverApi.saveBuyerAbout(occupation ? { occupation } : {});
  } catch (error) {
    return toState(error, 'Could not save that. Try again.');
  }

  redirect('/?welcome=done');
}
