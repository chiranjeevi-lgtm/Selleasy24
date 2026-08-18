'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { submitDecision, type ActionState } from '@/app/actions';
import { FormError } from '@/components/form-fields';

export interface CheckSpec {
  kind: string;
  label: string;
  /** What the seller asserted, shown so the verifier compares rather than recalls. */
  claim: string | null;
  /** Documents that settle this check, by display name. */
  evidence: string[];
  mandatory: boolean;
  /** Whether the supporting document was actually supplied. */
  evidenceAvailable: boolean;
}

type CheckState = 'pass' | 'fail' | 'skip';

function Submit({ decision }: { decision: string }) {
  const { pending } = useFormStatus();
  const label =
    decision === 'APPROVED'
      ? 'Approve and publish'
      : decision === 'REJECTED'
        ? 'Reject listing'
        : 'Request changes';

  const tone =
    decision === 'APPROVED'
      ? 'bg-seal text-paper hover:brightness-95'
      : 'bg-indigo text-paper hover:bg-indigo-deep';

  return (
    <button
      type="submit"
      disabled={pending}
      className={`px-5 py-2.5 text-[0.875rem] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-55 ${tone}`}
    >
      {pending ? 'Recording…' : label}
    </button>
  );
}

/**
 * The decision instrument.
 *
 * Structured as a comparison worksheet rather than a form: each row pairs a check
 * with the claim it tests and the document that settles it, because that is
 * literally the task. A verifier working from memory across two screens is how
 * mismatches get approved.
 *
 * The three-state control matters. "Not applicable" is genuinely different from
 * "failed" — an encumbrance certificate that was never required must not be
 * recorded as a failed check on a public badge.
 */
export function DecisionForm({
  listingId,
  checks,
}: {
  listingId: string;
  checks: CheckSpec[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(submitDecision, {});
  const [decision, setDecision] = useState('APPROVED');
  const [results, setResults] = useState<Record<string, CheckState>>(() =>
    Object.fromEntries(
      checks.map((check) => [
        check.kind,
        // Optional checks with no document default to "not applicable", which is
        // the honest starting position.
        check.mandatory ? 'pass' : check.evidenceAvailable ? 'pass' : 'skip',
      ]),
    ),
  );

  const approving = decision === 'APPROVED';
  const mandatoryFailing = checks.filter(
    (check) => check.mandatory && results[check.kind] !== 'pass',
  );
  const blockedFromApproval = approving && mandatoryFailing.length > 0;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="listingId" value={listingId} />

      <FormError message={state.error} />

      {/* ---------------- Checks ---------------- */}
      <section aria-labelledby="checks-heading">
        <h2 id="checks-heading" className="stamp-label text-seal">
          Document checks
        </h2>
        <p className="mt-2 max-w-prose text-[0.8125rem] leading-relaxed text-graphite">
          Each result below is published on the listing for buyers to read. Mark a
          check &ldquo;not applicable&rdquo; only when the document genuinely was
          not required.
        </p>

        <ul className="mt-4 divide-y divide-paper-edge border border-paper-edge bg-paper">
          {checks.map((check) => {
            const value = results[check.kind] ?? 'skip';
            return (
              <li key={check.kind} className="px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.875rem] leading-snug text-ink">
                      {check.label}
                      {check.mandatory && (
                        <span className="stamp-label ml-2 text-seal">Required</span>
                      )}
                    </p>

                    {check.claim && (
                      <p className="mt-1 text-[0.75rem] text-graphite">
                        Seller states:{' '}
                        <span className="text-ink">{check.claim}</span>
                      </p>
                    )}

                    <p className="mt-1 text-[0.6875rem] text-graphite-light">
                      {check.evidenceAvailable
                        ? `Check against: ${check.evidence.join(', ')}`
                        : `Not supplied: ${check.evidence.join(', ')}`}
                    </p>
                  </div>

                  {/* Radio group, not a checkbox: three states need three options,
                      and a checkbox cannot express "not applicable". */}
                  <fieldset className="flex shrink-0 gap-0">
                    <legend className="sr-only">{check.label} result</legend>
                    {(
                      [
                        ['pass', 'Pass'],
                        ['fail', 'Fail'],
                        ['skip', 'N/A'],
                      ] as const
                    ).map(([option, optionLabel]) => {
                      const selected = value === option;
                      const tone =
                        option === 'pass'
                          ? 'bg-seal text-paper border-seal'
                          : option === 'fail'
                            ? 'bg-ink text-paper border-ink'
                            : 'bg-graphite-light text-paper border-graphite-light';
                      return (
                        <label
                          key={option}
                          className={`cursor-pointer border px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider transition-colors ${
                            selected
                              ? tone
                              : 'border-paper-edge text-graphite hover:border-graphite'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`check:${check.kind}`}
                            value={option}
                            checked={selected}
                            onChange={() =>
                              setResults((prev) => ({ ...prev, [check.kind]: option }))
                            }
                            className="sr-only"
                          />
                          {optionLabel}
                        </label>
                      );
                    })}
                  </fieldset>
                </div>

                {/* A note on a non-passing check is what the buyer sees explaining
                    why. Only offered where it is meaningful. */}
                {value !== 'pass' && (
                  <input
                    name={`note:${check.kind}`}
                    maxLength={300}
                    placeholder={
                      value === 'skip'
                        ? 'Why is this not applicable? Shown publicly.'
                        : 'What was wrong? Shown publicly.'
                    }
                    aria-label={`Note for ${check.label}`}
                    className="mt-2.5 w-full border border-paper-edge bg-console px-2.5 py-1.5 text-[0.8125rem] text-ink outline-none focus:border-indigo"
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------------- Decision ---------------- */}
      <section aria-labelledby="decision-heading" className="border-t border-paper-edge pt-6">
        <h2 id="decision-heading" className="stamp-label text-graphite">
          Decision
        </h2>

        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ['APPROVED', 'Approve'],
              ['REVISION_REQUESTED', 'Request changes'],
              ['REJECTED', 'Reject'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`cursor-pointer border px-3.5 py-1.5 text-[0.8125rem] transition-colors ${
                decision === value
                  ? 'border-ink bg-ink text-paper'
                  : 'border-paper-edge bg-paper text-graphite hover:border-graphite'
              }`}
            >
              <input
                type="radio"
                name="decision"
                value={value}
                checked={decision === value}
                onChange={() => setDecision(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>

        {blockedFromApproval && (
          <div
            role="alert"
            className="mt-4 border-l-2 border-seal bg-seal-wash px-3.5 py-3"
          >
            <p className="text-[0.8125rem] leading-relaxed text-ink">
              You cannot approve while a required check is not passing:{' '}
              {mandatoryFailing.map((check) => check.label).join('; ')}. Either
              resolve it or request changes instead.
            </p>
          </div>
        )}

        {!approving && (
          <div className="mt-4">
            <label htmlFor="reason" className="block text-[0.75rem] text-graphite">
              Reason — emailed to the seller
            </label>
            <textarea
              id="reason"
              name="reason"
              rows={3}
              required
              minLength={10}
              maxLength={1000}
              placeholder="Be specific about what to fix. This is the only guidance they get."
              className="mt-1 w-full border border-paper-edge bg-paper px-2.5 py-2 text-[0.875rem] text-ink outline-none focus:border-indigo"
            />
          </div>
        )}

        <div className="mt-4">
          <label htmlFor="internalNotes" className="block text-[0.75rem] text-graphite">
            Internal notes — never shown to the seller or buyers
          </label>
          <textarea
            id="internalNotes"
            name="internalNotes"
            rows={2}
            maxLength={2000}
            className="mt-1 w-full border border-paper-edge bg-paper px-2.5 py-2 text-[0.875rem] text-ink outline-none focus:border-indigo"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Submit decision={decision} />
          <p className="text-[0.6875rem] text-graphite-light">
            Recorded against your account with a timestamp.
          </p>
        </div>
      </section>
    </form>
  );
}
