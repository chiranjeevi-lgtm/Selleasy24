'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { signUp, type FormState } from '../actions';
import {
  FormError,
  SelectInput,
  SubmitButton,
  TextInput,
} from '@/components/form-fields';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <SubmitButton pending={pending}>
      {pending ? 'Creating account…' : 'Create account'}
    </SubmitButton>
  );
}

export default function RegisterPage() {
  const [state, action] = useActionState<FormState, FormData>(signUp, {});
  // Drives the conditional RERA field. Brokers cannot list without a
  // registration number, and the API enforces that independently.
  const [role, setRole] = useState('BUYER');

  const isSeller = role === 'OWNER' || role === 'BROKER';

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <h1 className="font-display text-[1.75rem] font-extrabold leading-tight tracking-tight text-ink">
        Create an account
      </h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
        Choose how you will use SellEasy24. You can only change this later by
        contacting us.
      </p>

      <form action={action} className="mt-7 space-y-4">
        <FormError message={state.error} />

        <SelectInput
          name="role"
          label="I want to"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          error={state.fieldErrors?.role}
        >
          <option value="BUYER">Buy a property</option>
          <option value="OWNER">Sell my own property</option>
          <option value="BROKER">List properties for clients</option>
        </SelectInput>

        <TextInput
          name="fullName"
          label="Full name"
          required
          minLength={2}
          autoComplete="name"
          error={state.fieldErrors?.fullName}
        />

        <TextInput
          name="email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          error={state.fieldErrors?.email}
        />

        <TextInput
          name="phone"
          label="Phone"
          type="tel"
          autoComplete="tel"
          placeholder="+919876543210"
          /*
           * Asked here and confirmed on the next screen, whoever is signing up.
           * A seller needs a verified number before submitting a listing, and a
           * buyer needs one before enquiring or asking to visit — so both are
           * better off doing it now than being stopped later.
           */
          hint={
            isSeller
              ? 'Buyers reach you on this number. We confirm it on the next screen.'
              : 'Only the seller you contact ever sees it. We confirm it on the next screen.'
          }
          error={state.fieldErrors?.phone}
        />

        {role === 'BROKER' && (
          <TextInput
            name="reraNumber"
            label="RERA registration number"
            required
            hint="Agents must be RERA-registered to list property in Telangana."
            error={state.fieldErrors?.reraNumber}
          />
        )}

        <TextInput
          name="password"
          label="Password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          hint="At least 8 characters, with an uppercase letter, a number and a symbol."
          error={state.fieldErrors?.password}
        />

        <Submit />
      </form>

      <p className="mt-7 border-t border-line pt-5 text-[0.8125rem] text-muted">
        Already have an account?{' '}
        <Link href="/login" className="text-action hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
