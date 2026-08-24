'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveBudget, type StepState } from '../actions';
import { formatRupeesShort } from '@/lib/format';
import type { BuyerProfile } from '@/lib/server-api';

/**
 * Budget, in the units Indians actually speak.
 *
 * The field takes lakhs, not rupees. Asking someone to type 9500000 invites a
 * missing or extra zero on the single number the whole ranking depends on —
 * and nobody says "ninety-five lakh" as eight digits.
 */
const LAKH = 100_000;

function toRupees(lakhs: string): number | null {
  const value = Number(lakhs);
  return Number.isFinite(value) && value > 0 ? Math.round(value * LAKH) : null;
}

function fromRupees(rupees: number | null): string {
  return rupees === null ? '' : String(rupees / LAKH);
}

/**
 * What a bank will typically lend.
 *
 * A rule of thumb, not an offer: roughly sixty times monthly income, which is
 * the shape of a twenty-year loan at Indian rates with an EMI near forty per
 * cent of income. Presented as an estimate because that is what it is — the
 * lender decides, not us.
 */
function indicativeLoan(monthlyIncome: number): number {
  return Math.round((monthlyIncome * 60) / LAKH) * LAKH;
}

export function BudgetForm({ profile }: { profile: BuyerProfile }) {
  const [state, action] = useActionState<StepState, FormData>(saveBudget, {});
  const [minLakhs, setMinLakhs] = useState(fromRupees(profile.budgetMin));
  const [maxLakhs, setMaxLakhs] = useState(fromRupees(profile.budgetMax));
  const [income, setIncome] = useState(
    profile.monthlyIncome === null ? '' : String(profile.monthlyIncome),
  );

  const min = toRupees(minLakhs);
  const max = toRupees(maxLakhs);
  const outOfOrder = min !== null && max !== null && min > max;

  const incomeValue = Number(income);
  const loan =
    Number.isFinite(incomeValue) && incomeValue > 0 ? indicativeLoan(incomeValue) : null;

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

      {/* Hidden rupee values, so the server never has to guess the unit. */}
      <input type="hidden" name="budgetMin" value={min ?? ''} />
      <input type="hidden" name="budgetMax" value={max ?? ''} />

      <fieldset>
        <legend className="text-[0.9375rem] font-medium text-ink">
          Roughly what are you willing to spend?
        </legend>
        <p className="mt-1 text-[0.8125rem] text-muted">
          In lakhs. One crore is 100 lakh.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[0.8125rem] text-muted">At least</span>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="number"
                min={1}
                step={1}
                value={minLakhs}
                onChange={(event) => setMinLakhs(event.target.value)}
                placeholder="50"
                aria-label="Minimum budget in lakhs"
                className="w-full rounded-control border border-line bg-surface px-3 py-2.5 text-[0.9375rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15"
              />
              <span className="text-[0.875rem] text-muted">lakh</span>
            </div>
          </label>

          <label className="block">
            <span className="text-[0.8125rem] text-muted">At most</span>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="number"
                min={1}
                step={1}
                value={maxLakhs}
                onChange={(event) => setMaxLakhs(event.target.value)}
                placeholder="95"
                aria-label="Maximum budget in lakhs"
                className={`w-full rounded-control border bg-surface px-3 py-2.5 text-[0.9375rem] text-ink outline-none transition-colors focus:ring-2 ${
                  outOfOrder
                    ? 'border-seal focus:border-seal focus:ring-seal/15'
                    : 'border-line focus:border-action focus:ring-action/15'
                }`}
              />
              <span className="text-[0.875rem] text-muted">lakh</span>
            </div>
          </label>
        </div>

        {/* Echoed back in full so a mistyped figure is obvious before it is
            saved — this is the number the whole ranking hangs on. */}
        {(min !== null || max !== null) && !outOfOrder && (
          <p className="mt-2.5 text-[0.875rem] text-ink tabular">
            {min !== null && max !== null
              ? `${formatRupeesShort(min)} to ${formatRupeesShort(max)}`
              : min !== null
                ? `From ${formatRupeesShort(min)}`
                : `Up to ${formatRupeesShort(max!)}`}
          </p>
        )}

        {outOfOrder && (
          <p role="alert" className="mt-2.5 text-[0.8125rem] text-seal">
            The most has to be at least the least.
          </p>
        )}
      </fieldset>

      {/*
        Optional, asked last, and with the reason stated. This is financial
        personal data under the DPDPA and it plays no part in ranking — budget
        already carries that. It exists only to say what a bank is likely to
        lend, and a seller never sees it.
      */}
      <fieldset className="rounded-card border border-line bg-surface px-4 py-4">
        <legend className="px-1 text-[0.875rem] font-medium text-ink">
          Monthly income <span className="font-normal text-faint">— optional</span>
        </legend>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          Only used to estimate what a bank would lend you. It never affects
          which properties we show, and it is never shown to a seller. Leave it
          blank and nothing here changes.
        </p>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-[0.9375rem] text-muted">₹</span>
          <input
            name="monthlyIncome"
            type="number"
            min={0}
            step={1000}
            value={income}
            onChange={(event) => setIncome(event.target.value)}
            placeholder="150000"
            aria-label="Monthly income in rupees"
            className="w-44 rounded-control border border-line bg-canvas px-3 py-2.5 text-[0.9375rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15"
          />
          <span className="text-[0.875rem] text-muted">per month</span>
        </div>

        {loan !== null && (
          <p className="mt-3 rounded-control bg-canvas-deep px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-ink">
            A bank would typically lend around{' '}
            <span className="font-semibold tabular">{formatRupeesShort(loan)}</span> on
            that income over twenty years. An estimate only — the lender decides,
            and their offer will depend on your other commitments.
          </p>
        )}
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
