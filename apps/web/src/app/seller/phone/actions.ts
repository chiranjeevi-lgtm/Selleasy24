'use server';

import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/api';
import { serverApi } from '@/lib/server-api';

export interface PhoneState {
  step: 'phone' | 'code' | 'done';
  phone?: string;
  /**
   * Shown on screen only when the API returns it, which happens exclusively
   * under the console delivery driver. With a real provider this stays
   * undefined and the interface simply says a code was sent.
   */
  demoCode?: string;
  expiresInMinutes?: number;
  error?: string;
}

export async function requestCode(
  _prev: PhoneState,
  form: FormData,
): Promise<PhoneState> {
  const phone = String(form.get('phone') ?? '').trim();

  try {
    const result = await serverApi.requestPhoneCode(phone);
    return {
      step: 'code',
      phone,
      ...(result.code && { demoCode: result.code }),
      expiresInMinutes: result.expiresInMinutes,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      return {
        step: 'phone',
        phone,
        error: 'Too many code requests. Wait a few minutes and try again.',
      };
    }
    if (error instanceof ApiError) {
      return { step: 'phone', phone, error: error.message };
    }
    return { step: 'phone', phone, error: 'Could not send a code. Try again.' };
  }
}

export async function verifyCode(
  prev: PhoneState,
  form: FormData,
): Promise<PhoneState> {
  const phone = String(form.get('phone') ?? '').trim();
  const code = String(form.get('code') ?? '').trim();

  try {
    await serverApi.verifyPhoneCode(phone, code);
  } catch (error) {
    const message =
      error instanceof ApiError && error.status === 409
        ? 'That number is already verified on another account.'
        : error instanceof ApiError
          ? error.message
          : 'Could not verify that code.';

    // Stay on the code step and keep the demo code visible, so a wrong entry
    // does not force the whole flow to be restarted.
    return { ...prev, step: 'code', phone, error: message };
  }

  // A verified phone unblocks listing submission, so the seller's pages have to
  // re-read the account.
  revalidatePath('/seller/listings');
  revalidatePath('/seller/phone');

  return { step: 'done', phone };
}
