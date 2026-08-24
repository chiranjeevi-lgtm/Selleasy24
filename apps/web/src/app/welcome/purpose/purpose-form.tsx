'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { savePurpose, type StepState } from '../actions';
import type { BuyerProfile } from '@/lib/server-api';

/**
 * Why they are buying, and for how many people.
 *
 * Three residential purposes, because that is what the platform sells.
 * Commercial is not offered — collecting a preference nothing can satisfy
 * would be a promise we cannot keep.
 */
const PURPOSES = [
  {
    value: 'LIVE_IN',
    label: 'To live in',
    detail: 'A home for you and whoever lives with you.',
  },
  {
    value: 'RENT_OUT',
    label: 'To rent out',
    detail: 'You will let it. Ready-to-move matters most.',
  },
  {
    value: 'INVESTMENT',
    label: 'To hold',
    detail: 'Buying for what it will be worth later.',
  },
] as const;

/** A suggestion, never a rule — the buyer can change the answer. */
function suggestedBedrooms(householdSize: number): number {
  if (householdSize <= 1) return 1;
  if (householdSize <= 3) return 2;
  if (householdSize <= 5) return 3;
  return 4;
}

export function PurposeForm({ profile }: { profile: BuyerProfile }) {
  const [state, action] = useActionState<StepState, FormData>(savePurpose, {});
  const [purpose, setPurpose] = useState<string>(profile.purpose ?? '');
  const [household, setHousehold] = useState<string>(
    profile.householdSize === null ? '' : String(profile.householdSize),
  );
  const [bedrooms, setBedrooms] = useState<string>(
    profile.bedroomsWanted === null ? '' : String(profile.bedroomsWanted),
  );
  /*
   * Once the buyer edits the bedroom count themselves, household size stops
   * driving it. Overwriting a deliberate choice because they corrected the
   * number of people is the sort of thing that makes a form feel like it is
   * arguing with you.
   */
  const [bedroomsTouched, setBedroomsTouched] = useState(profile.bedroomsWanted !== null);

  function onHouseholdChange(value: string) {
    setHousehold(value);
    const size = Number(value);
    if (!bedroomsTouched && Number.isInteger(size) && size > 0) {
      setBedrooms(String(suggestedBedrooms(size)));
    }
  }

  // Only for people who will live there. Someone letting a flat out is not
  // housing their own family in it, so the question does not apply.
  const asksHousehold = purpose === 'LIVE_IN';

  return (
    <form action={action} className="space-y-7">
      {state.error && (
        <p
          role="alert"
          className="rounded-control border-l-2 border-seal bg-seal-soft px-3.5 py-2.5 text-[0.875rem] text-ink"
        >
          {state.error}
        </p>
      )}

      <fieldset>
        <legend className="text-[0.9375rem] font-medium text-ink">
          What is this property for?
        </legend>

        <div className="mt-3 space-y-2">
          {PURPOSES.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-card border px-4 py-3.5 transition-colors ${
                purpose === option.value
                  ? 'border-action bg-action/[0.04] ring-1 ring-action/30'
                  : 'border-line hover:border-action/40 hover:bg-canvas-deep'
              }`}
            >
              <input
                type="radio"
                name="purpose"
                value={option.value}
                checked={purpose === option.value}
                onChange={() => setPurpose(option.value)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-action)]"
              />
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-medium text-ink">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-muted">
                  {option.detail}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {asksHousehold && (
        <div className="settle">
          <label htmlFor="householdSize" className="block text-[0.9375rem] font-medium text-ink">
            How many people will live there?
          </label>
          <p className="mt-1 text-[0.8125rem] text-muted">
            Just to suggest a size. You can change it below.
          </p>
          <input
            id="householdSize"
            name="householdSize"
            type="number"
            min={1}
            max={30}
            value={household}
            onChange={(event) => onHouseholdChange(event.target.value)}
            className="mt-2 w-28 rounded-control border border-line bg-surface px-3 py-2.5 text-[0.9375rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15"
          />
        </div>
      )}

      <fieldset>
        <legend className="text-[0.9375rem] font-medium text-ink">
          How many bedrooms?
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((count) => {
            const value = String(count);
            const selected = bedrooms === value;
            return (
              <label
                key={count}
                className={`cursor-pointer rounded-full border px-4 py-2 text-[0.875rem] font-medium transition-colors ${
                  selected
                    ? 'border-action bg-action text-white'
                    : 'border-line text-ink hover:border-action/40 hover:bg-canvas-deep'
                }`}
              >
                <input
                  type="radio"
                  name="bedroomsWanted"
                  value={value}
                  checked={selected}
                  onChange={() => {
                    setBedrooms(value);
                    setBedroomsTouched(true);
                  }}
                  className="sr-only"
                />
                {count} BHK
                {count === 5 && '+'}
              </label>
            );
          })}
        </div>
      </fieldset>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? 'Saving…' : 'Continue'}
    </button>
  );
}
