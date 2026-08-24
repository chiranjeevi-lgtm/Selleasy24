'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { resetPassword } from '../actions';
import type { FormState } from '../actions';
import { FormError, SubmitButton, TextInput } from '@/components/form-fields';

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(resetPassword, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <FormError message={state.error} />

      <TextInput
        name="password"
        label="New password"
        type="password"
        required
        autoComplete="new-password"
        autoFocus
        minLength={12}
        hint="At least 12 characters, with upper and lower case, a number and a symbol."
        {...(state.fieldErrors?.password && { error: state.fieldErrors.password })}
      />

      <TextInput
        name="confirmPassword"
        label="Type it again"
        type="password"
        required
        autoComplete="new-password"
        minLength={12}
        {...(state.fieldErrors?.confirmPassword && {
          error: state.fieldErrors.confirmPassword,
        })}
      />

      {/*
        Stated before they act, not after. Someone resetting because they think
        their account was taken needs to know this is what closes the intruder
        out — and someone doing it casually should not be surprised to find
        themselves signed out on their phone.
      */}
      <p className="rounded-control bg-canvas-deep px-3.5 py-3 text-[0.8125rem] leading-relaxed text-muted">
        Setting a new password signs you out everywhere else. Any other device
        with this account open will have to sign in again.
      </p>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <SubmitButton pending={pending}>
      {pending ? 'Saving…' : 'Set new password'}
    </SubmitButton>
  );
}
