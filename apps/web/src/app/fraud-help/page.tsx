import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Report fraud · Property scam checklist for Hyderabad',
  description:
    'How to spot fake listings, fraudulent agents, and RERA irregularities in Hyderabad — and how to report them to SellEasy24.',
};

/**
 * Anti-fraud help desk.
 *
 * Public educational page + reporting entry point. Deliberately Hyderabad-
 * specific: the checklists reference TSRERA, HMDA, and the Telangana
 * Registration & Stamps portal rather than generic advice, because generic
 * advice is what fraudulent sellers count on.
 *
 * No form here — reports are made per-listing (the button on every listing
 * card routes to the same moderation queue). Sending buyers to a generic
 * "contact us" form invites lower-quality reports; sending them back to the
 * specific listing gives moderators the context they need to act.
 */

interface ScamPattern {
  title: string;
  how: string;
  redFlags: string[];
}

const SCAM_PATTERNS: ScamPattern[] = [
  {
    title: 'The fake agent',
    how: 'Someone claims to represent SellEasy24 (or a builder) using a copied logo, a Gmail/Yahoo email address, and pressure to pay a "site visit fee" or "booking token" to a personal bank account.',
    redFlags: [
      'Email is a personal ID, not on the company domain',
      'Request for advance payment before you have visited the property',
      'Payment demanded to a personal account, UPI ID, or PhonePe number — never to a company account',
      'No official ID card, no company documentation',
      'Urgency: "the seller is deciding today", "another buyer just paid"',
    ],
  },
  {
    title: 'The fake listing',
    how: 'A listing copies photos and text from a real property, prices it 20–30% below market, and pushes the buyer to transfer a token amount to "hold the deal". The owner named on the listing has no idea it exists.',
    redFlags: [
      'Price is significantly below the locality median for that configuration',
      'Owner is "out of station" or otherwise unavailable for a site visit',
      'Photographs feel generic, or reverse-image search shows the same photos on other portals',
      'Description is vague on floor, orientation, or exact address',
      'Pressure to send a token before verification',
    ],
  },
  {
    title: 'RERA registration fraud',
    how: 'A developer or broker uses an expired RERA number, a copied number from a different project, or a number that does not resolve on the TSRERA portal at all — allowing them to sell units that carry no regulatory protection for the buyer.',
    redFlags: [
      'RERA number does not resolve on rera.telangana.gov.in',
      'Registration date is old and the completion deadline has passed',
      'Project name on the RERA record does not match the brochure',
      'Tower or phase you were shown is not listed under the registration',
      'Developer refuses to share the RERA certificate PDF',
    ],
  },
  {
    title: 'Portal cloning',
    how: 'A near-duplicate website with a lookalike domain (selleasy24.co, selleazy24.com, etc.) collects payments from buyers who thought they were on the real site.',
    redFlags: [
      'URL is not exactly selleasy24.com',
      'No HTTPS padlock in the address bar',
      'Design is close but off — wrong colours, blurry logo, misaligned layout',
      'Payment requested to a personal bank account',
      'Grammar and spelling errors in the copy',
    ],
  },
];

interface VerifyStep {
  title: string;
  body: string;
}

const TSRERA_STEPS: VerifyStep[] = [
  {
    title: 'Open the TSRERA portal',
    body: 'Go to rera.telangana.gov.in on your own device. Do not click a link the seller sends you — type the URL yourself.',
  },
  {
    title: 'Search the RERA number',
    body: 'The portal has a search field for registration numbers. A valid Telangana RERA number is a fixed-length alphanumeric string; if it does not resolve, the project is not registered.',
  },
  {
    title: 'Match every detail',
    body: 'Check that the project name, promoter (developer), tower/phase, unit configuration, and completion deadline all match what you were shown in the brochure. Any mismatch is a red flag.',
  },
  {
    title: 'Check the amendment history',
    body: 'Registered projects can post amendments — extensions, changes of promoter, or complaints. Read them. A pattern of extension requests suggests the project is behind schedule.',
  },
];

const REGISTRATION_STEPS: VerifyStep[] = [
  {
    title: 'Ask for the sale deed and the encumbrance certificate',
    body: 'The sale deed names the current owner. The encumbrance certificate (EC) shows every registered charge on the property for the last 13 years. Both are public records — the seller has them, or can get them from their sub-registrar office.',
  },
  {
    title: 'Verify at the sub-registrar office',
    body: 'Visit the sub-registrar office for the survey number listed on the deed. They confirm the ownership chain against their register. The office charges a small fee for an official EC — pay it. Sellers who resist this step are worth walking away from.',
  },
  {
    title: 'Confirm the building has its approvals',
    body: 'Every residential project needs sanctioned building plans from HMDA or GHMC, and every completed apartment needs an occupancy certificate (OC) before residents can legally move in. Ask for both PDFs and cross-check the sanction number against the approving authority. A project without an OC will not clear a home loan.',
  },
];

export default function FraudHelpPage() {
  return (
    <div className="mx-auto max-w-[46rem] px-5 py-12 sm:px-8 sm:py-16">
      <header>
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2.25rem] text-ink sm:text-[2.75rem]">
          Report fraud — and how to spot it first
        </h1>
        <p className="mt-5 text-[1.0625rem] leading-relaxed text-muted">
          Every listing on SellEasy24 is checked by a verification officer
          against ownership documents before it appears. That check catches
          most fraud before a buyer sees it. This page is for the rest: what
          to look for on any property site, and what to do if something looks
          wrong.
        </p>
      </header>

      <section
        aria-labelledby="promise-heading"
        className="mt-10 rounded-card bg-verify-soft p-6 ring-1 ring-verify/25"
      >
        <p id="promise-heading" className="label text-verify-ink">
          What we will never do
        </p>
        <ul className="mt-3 space-y-2 text-[0.9375rem] text-ink">
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-verify" />
            Ask for advance payment before you visit a property.
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-verify" />
            Request payment to a personal bank account, UPI ID, or wallet.
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-verify" />
            Send a representative without a visible SellEasy24 ID card that
            you can photograph and verify.
          </li>
          <li className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-verify" />
            Contact you from a personal Gmail, Yahoo, or Outlook address —
            every officer communicates from an @selleasy24.com address.
          </li>
        </ul>
      </section>

      <section aria-labelledby="patterns-heading" className="mt-14">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="patterns-heading" className="display text-[1.625rem] text-ink">
          Four scam patterns to know
        </h2>
        <p className="mt-2 text-[0.9375rem] text-muted">
          Each of these is a real pattern seen in the Hyderabad property market
          in the last two years. If you see the red flags, stop and check.
        </p>

        <div className="mt-8 space-y-8">
          {SCAM_PATTERNS.map((pattern, index) => (
            <article key={pattern.title} className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line">
              <p className="label text-faint">Pattern {index + 1}</p>
              <h3 className="display mt-2 text-[1.25rem] text-ink">{pattern.title}</h3>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{pattern.how}</p>

              <p className="mt-5 label text-verify">Red flags</p>
              <ul className="mt-2 space-y-1.5">
                {pattern.redFlags.map((flag) => (
                  <li
                    key={flag}
                    className="flex items-start gap-2 text-[0.9375rem] leading-relaxed text-ink"
                  >
                    <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-seal" />
                    {flag}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="verify-heading" className="mt-14">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="verify-heading" className="display text-[1.625rem] text-ink">
          How to verify a Telangana property yourself
        </h2>
        <p className="mt-2 text-[0.9375rem] text-muted">
          Every check below can be done in an afternoon, uses only public
          records, and does not require paying anyone. If a seller resists any
          of them, that itself is your answer.
        </p>

        <div className="mt-8">
          <h3 className="display text-[1.125rem] text-ink">Verify the RERA registration</h3>
          <ol className="mt-4 space-y-4">
            {TSRERA_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-action text-[0.8125rem] font-semibold text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="text-[1rem] font-semibold text-ink">{step.title}</p>
                  <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-10">
          <h3 className="display text-[1.125rem] text-ink">Verify the ownership</h3>
          <ol className="mt-4 space-y-4">
            {REGISTRATION_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-action text-[0.8125rem] font-semibold text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="text-[1rem] font-semibold text-ink">{step.title}</p>
                  <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="report-heading"
        className="mt-14 rounded-card bg-action p-8 text-white sm:p-10"
      >
        <h2 id="report-heading" className="display text-[1.5rem] text-white">
          Report a suspicious listing or agent
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/80">
          Every listing on SellEasy24 has a &ldquo;Report this listing&rdquo;
          option — that is the fastest route, because it gives moderators the
          exact listing context they need to act. If the report concerns
          someone claiming to represent us who is not on a listing, email us
          directly.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-control bg-verify px-5 py-2.5 text-[0.9375rem] font-semibold text-verify-ink transition-transform duration-200 hover:-translate-y-px"
          >
            Browse listings to report
          </Link>
          <a
            href="mailto:fraudreport@selleasy24.com"
            className="rounded-control border border-white/30 px-5 py-2.5 text-[0.9375rem] font-medium text-white transition-colors hover:bg-white/10"
          >
            fraudreport@selleasy24.com
          </a>
        </div>
        <p className="mt-6 text-[0.8125rem] text-white/60">
          We respond within 24 hours on business days. Reports involving
          criminal fraud are escalated to the Cyberabad Police Cybercrime
          Cell.
        </p>
      </section>
    </div>
  );
}
