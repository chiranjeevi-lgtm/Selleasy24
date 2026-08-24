'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveAbout, type StepState } from '../actions';
import type { BuyerProfile } from '@/lib/server-api';

/**
 * Occupation.
 *
 * An enum rather than free text so the answer means the same thing for every
 * buyer, and so it can be reported on later. It is the question a lender asks
 * first, which is the only reason it is here — it plays no part in ranking.
 */
const OCCUPATIONS = [
  { value: 'SALARIED', label: 'Salaried' },
  { value: 'SELF_EMPLOYED', label: 'Self-employed' },
  { value: 'BUSINESS_OWNER', label: 'Business owner' },
  { value: 'PROFESSIONAL', label: 'Professional' },
  { value: 'RETIRED', label: 'Retired' },
  { value: 'STUDENT', label: 'Student' },
  { value: 'OTHER', label: 'Something else' },
] as const;

export function AboutForm({ profile }: { profile: BuyerProfile }) {
  const [state, action] = useActionState<StepState, FormData>(saveAbout, {});
  const [occupation, setOccupation] = useState(profile.occupation ?? '');

  return (
    <form action={action} className="space-y-6">
      {state.error && (
        <p
          role="alert"
          className="rounded-control border-l-2 border-seal bg-seal-soft px-3.5 py-2.5 text-[0.875rem] text-ink"
        >
          {state.error}
        </p>
      )}

      <fieldset>
        <legend className="sr-only">Occupation</legend>
        <div className="flex flex-wrap gap-2">
          {OCCUPATIONS.map((option) => {
            const selected = occupation === option.value;
            return (
              <label
                key={option.value}
                className={`cursor-pointer rounded-full border px-4 py-2 text-[0.875rem] font-medium transition-colors ${
                  selected
                    ? 'border-action bg-action text-white'
                    : 'border-line text-ink hover:border-action/40 hover:bg-canvas-deep'
                }`}
              >
                <input
                  type="radio"
                  name="occupation"
                  value={option.value}
                  checked={selected}
                  onChange={() => setOccupation(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <Submit answered={occupation !== ''} />
    </form>
  );
}

function Submit({ answered }: { answered: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? 'Saving…' : answered ? 'Finish' : 'Finish without answering'}
    </button>
  );
}
