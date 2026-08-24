'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { requestPasswordReset, type ResetState } from '../actions';
import { FormError, SubmitButton, TextInput } from '@/components/form-fields';

export function ForgotForm() {
  const [state, action] = useActionState<ResetState, FormData>(requestPasswordReset, {});

  /*
   * The same confirmation whether or not the address is registered.
   *
   * The API answers identically for both on purpose, so that the endpoint
   * cannot be used to find out who has an account here. Saying "no such user"
   * on this screen would hand back precisely the information the API is
   * refusing to give.
   */
  if (state.sent) {
    return (
      <div className="rounded-card border border-line bg-surface p-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-action text-[0.8125rem] text-white"
          >
            ✓
          </span>
          <div>
            <h2 className="text-[1.0625rem] font-semibold text-ink">Check your email</h2>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">
              If that address has an account, a link to set a new password is on
              its way. It expires in an hour.
            </p>
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-faint">
              Nothing arrived? Check the spam folder, and make sure you used the
              address you signed up with.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />

      <TextInput
        name="email"
        label="Email address"
        type="email"
        required
        autoComplete="email"
        autoFocus
        placeholder="you@example.com"
        hint="The address you signed up with."
      />

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <SubmitButton pending={pending}>
      {pending ? 'Sending…' : 'Send me a link'}
    </SubmitButton>
  );
}
