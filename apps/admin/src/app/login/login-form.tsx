'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, type ActionState } from '../actions';
import { FormError, SubmitButton, TextInput } from '@/components/form-fields';

function Submit() {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>{pending ? 'Signing in…' : 'Sign in'}</SubmitButton>;
}

export function LoginForm() {
  const [state, action] = useActionState<ActionState, FormData>(signIn, {});

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />

      <TextInput
        name="email"
        label="Work email"
        type="email"
        required
        autoComplete="email"
        autoFocus
      />

      <TextInput
        name="password"
        label="Password"
        type="password"
        required
        autoComplete="current-password"
      />

      <Submit />
    </form>
  );
}
