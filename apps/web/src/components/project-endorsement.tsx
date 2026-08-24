import type { ProjectVerificationRecord } from '@/lib/api';
import { formatDate } from '@/lib/format';

/**
 * The verification record for a project.
 *
 * Same argument as the listing endorsement, with one addition that matters more
 * here: the RERA registration number is printed rather than described. It is a
 * public register entry, so a buyer can take that number to the TS-RERA site and
 * check it against us. A badge nobody can audit is just an adjective.
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
  // An em dash, not a cross — "not applicable" is not "failed".
  return (
    <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-canvas-deep text-faint">
      <span aria-hidden="true" className="text-[0.75rem] leading-none">&ndash;</span>
    </span>
  );
}

export function ProjectEndorsement({ record }: { record: ProjectVerificationRecord }) {
  const verifiedOn = formatDate(record.verifiedAt);

  return (
    <section
      aria-labelledby="project-verification-heading"
      className="overflow-hidden rounded-card bg-surface shadow-card"
    >
      <div aria-hidden="true" className="h-1 bg-verify" />

      <div className="px-5 py-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="project-verification-heading" className="label text-action">
            Verification record
          </h2>
          {verifiedOn && <span className="label tabular text-muted">{verifiedOn}</span>}
        </div>

        <p className="mt-3 text-[0.875rem] leading-relaxed text-muted">
          An officer checked this project against the public registers before it
          appeared here.
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
                <span className={check.passed ? 'text-ink' : 'text-muted'}>{check.label}</span>
                {check.note && (
                  <span className="mt-0.5 block text-[0.8125rem] leading-snug text-faint">
                    {check.note}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {/*
          Printed, not summarised. A buyer can put this number into the TS-RERA
          portal and check our claim — which is the only thing that makes the
          record worth anything.
        */}
        <div className="mt-5 rounded-control bg-verify-soft px-3.5 py-3">
          <p className="label text-verify-ink">TS-RERA registration</p>
          <p className="mt-1 text-[0.9375rem] font-semibold tabular text-ink">
            {record.reraNumber}
          </p>
          <p className="mt-1.5 text-[0.75rem] leading-relaxed text-muted">
            Look this up on the TS-RERA register yourself. We would rather you
            checked than took our word for it.
          </p>
        </div>
      </div>
    </section>
  );
}
