import type { VerificationRecord } from '@/lib/api';
import { formatAge, formatDate } from '@/lib/format';

/**
 * The Verification Record.
 *
 * This is the product. Every competing portal shows a green tick that asserts
 * "verified" without saying what was checked — which is why buyers have learned
 * to ignore it. MagicBricks goes further and hides public RERA data behind a
 * lead-capture wall.
 *
 * So this renders the record the way a registered document carries a
 * registrar's endorsement: what was checked, what was not, and on what date. No
 * login required. Legibility is the entire argument.
 */

function Tick({ passed }: { passed: boolean }) {
  if (passed) {
    return (
      <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-verify-ink">
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-2.5 w-2.5 text-verify">
          <path
            className="draw-check"
            d="M2.5 8.5 6 12l7.5-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  // An em dash, not a cross. "Not applicable" is different from "failed", and
  // overstating it would be dishonest on the one feature that has to be trusted.
  return (
    <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-canvas-deep text-faint">
      <span aria-hidden="true" className="text-[0.75rem] leading-none">&ndash;</span>
    </span>
  );
}

export function Endorsement({ record }: { record: VerificationRecord }) {
  const verifiedOn = formatDate(record.verifiedAt);
  const confirmedAge = formatAge(record.lastConfirmedAt);

  return (
    <section
      aria-labelledby="verification-heading"
      className="overflow-hidden rounded-card bg-surface shadow-card"
    >
      {/* Struck rule in gold over navy — the mark of the record, and the only
          place this pairing appears at full weight. */}
      <div aria-hidden="true" className="h-1 bg-verify" />

      <div className="px-5 py-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="verification-heading" className="label text-action">
            Verification record
          </h2>
          {verifiedOn && <span className="label tabular text-muted">{verifiedOn}</span>}
        </div>

        <p className="mt-3 text-[0.875rem] leading-relaxed text-muted">
          An officer compared the seller&rsquo;s documents against this listing.
          Here is exactly what was checked.
        </p>

        <ul className="mt-4 space-y-3">
          {record.checks.map((check, index) => (
            <li
              key={check.kind}
              className="rise flex gap-2.5"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <Tick passed={check.passed} />
              <span className="text-[0.875rem] leading-snug">
                <span className={check.passed ? 'text-ink' : 'text-muted'}>
                  {check.label}
                </span>
                {check.note && (
                  <span className="mt-0.5 block text-[0.8125rem] leading-snug text-faint">
                    {check.note}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {confirmedAge && (
          <p className="mt-5 border-t border-line pt-4 text-[0.8125rem] text-muted">
            Owner confirmed this is still available{' '}
            <span className="font-medium text-ink">{confirmedAge}</span>.
          </p>
        )}
      </div>
    </section>
  );
}
