'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, type FormState } from '../actions';
import { FormError, SubmitButton, TextInput } from '@/components/form-fields';

function Submit() {
  const { pending } = useFormStatus();
  return <SubmitButton pending={pending}>{pending ? 'Signing in…' : 'Sign in'}</SubmitButton>;
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(signIn, {});

  return (
    <form action={action} className="space-y-4">
      {/* Re-validated server-side: only same-site relative paths are honoured. */}
      <input type="hidden" name="next" value={next} />

      <FormError message={state.error} />

      <TextInput
        name="identifier"
        label="Email or username"
        type="text"
        required
        autoComplete="username"
        autoFocus
        hint="Whichever you signed up with — both work."
        error={state.fieldErrors?.identifier ?? state.fieldErrors?.email}
      />

      <TextInput
        name="password"
        label="Password"
        type="password"
        required
        autoComplete="current-password"
        error={state.fieldErrors?.password}
      />

      <Submit />
    </form>
  );
}
