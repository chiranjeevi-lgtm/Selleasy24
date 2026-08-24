'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { submitProjectDecision, type ActionState } from '@/app/actions';
import { FormError } from '@/components/form-fields';

export interface ProjectCheckSpec {
  kind: string;
  label: string;
  /** What the builder asserted, shown so the officer compares rather than recalls. */
  claim: string | null;
  /** Documents that settle this check, by display name. */
  evidence: string[];
  /** Driven by the project's stage, as reported by the API. */
  mandatory: boolean;
  evidenceAvailable: boolean;
}

type CheckState = 'pass' | 'fail' | 'skip';

function Submit({ decision }: { decision: string }) {
  const { pending } = useFormStatus();
  const label =
    decision === 'APPROVED'
      ? 'Approve and publish'
      : decision === 'REJECTED'
        ? 'Reject project'
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
 * The project decision instrument.
 *
 * Same worksheet shape as the listing form, and the same three-state control for
 * the same reason: "not applicable" is genuinely different from "failed", and a
 * commencement certificate that a pre-launch project cannot yet have must not be
 * published as a failed check.
 *
 * Which checks are required is decided by the API from the project's stage and
 * passed in. Deriving it a second time here would give the officer a checklist
 * that could disagree with the endpoint refusing their approval.
 */
export function ProjectDecisionForm({
  projectId,
  checks,
}: {
  projectId: string;
  checks: ProjectCheckSpec[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(submitProjectDecision, {});
  const [decision, setDecision] = useState('APPROVED');
  const [results, setResults] = useState<Record<string, CheckState>>(() =>
    Object.fromEntries(
      checks.map((check) => [
        check.kind,
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
      <input type="hidden" name="projectId" value={projectId} />

      <FormError message={state.error} />

      <section aria-labelledby="checks-heading">
        <h2 id="checks-heading" className="stamp-label text-seal">
          Register checks
        </h2>
        <p className="mt-2 max-w-prose text-[0.8125rem] leading-relaxed text-graphite">
          Each result below is published on the project page for buyers to read.
          The RERA number is published alongside them, so a buyer can repeat the
          first check themselves — which is rather the point.
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
                        Builder states: <span className="text-ink">{check.claim}</span>
                      </p>
                    )}

                    <p className="mt-1 text-[0.6875rem] text-graphite-light">
                      {check.evidenceAvailable
                        ? `Check against: ${check.evidence.join(', ')}`
                        : `Not supplied: ${check.evidence.join(', ')}`}
                    </p>
                  </div>

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
                            selected ? tone : 'border-paper-edge text-graphite hover:border-graphite'
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
          <div role="alert" className="mt-4 border-l-2 border-seal bg-seal-wash px-3.5 py-3">
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
              Reason — emailed to the builder
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
            Internal notes — never shown to the builder or buyers
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
