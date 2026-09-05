import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Sell your property · Verified listings on SellEasy24',
  description:
    'List your home in Telangana with SellEasy24. A verification officer checks your ownership documents before your listing appears — every enquiry that reaches you is from a real, interested buyer.',
};

/**
 * Public seller landing page.
 *
 * This is the marketing page that sits behind "Sell" in the header — the
 * seller equivalent of the buyer-focused homepage. Users who click through
 * from the CTA land on /seller/listings which is the actual authenticated
 * flow to draft a listing.
 *
 * Structure mirrors the site's other content pages: gold rule + display
 * heading, three "why" cards, a numbered step-by-step, an FAQ, and a
 * plain-text disclosure block that names what verification does and does
 * not cover. No claims about "guaranteed sales" — every promise here has
 * to survive the same written-commitment discipline as the rest of the
 * platform.
 */

interface Step {
  n: number;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    n: 1,
    title: 'Create your account',
    body: 'Sign up as an OWNER (selling your own property) or BROKER (with RERA registration). Phone verified via OTP; the number stays with you and only reaches the one buyer you deal with.',
  },
  {
    n: 2,
    title: 'Add your property',
    body: 'Structured form — address, configuration, area, price, amenities. Upload photos and your ownership documents. Save as many drafts as you need before submitting.',
  },
  {
    n: 3,
    title: 'Submit for verification',
    body: 'A SellEasy24 verification officer compares your ownership documents against the listing. Sale deed, encumbrance certificate, RERA number if applicable — all checked against public registers.',
  },
  {
    n: 4,
    title: 'Listing goes live in 24 hours',
    body: 'Once approved, your listing is visible to every verified-inventory buyer on the platform. The verification stamp shows the officer\'s ID and the date the check was performed.',
  },
  {
    n: 5,
    title: 'Receive enquiries directly',
    body: 'Every enquiry lands in your seller dashboard. You choose whether to reveal your phone number to a particular buyer. Site visit requests come with the buyer\'s preferred time and account details.',
  },
];

interface Why {
  label: string;
  title: string;
  body: string;
}

const WHY_SELLEASY: Why[] = [
  {
    label: 'One-shot verification',
    title: 'Not a paperwork ordeal every time',
    body: 'Your documents are verified once, before your first listing goes live. Subsequent listings from your account move faster because the trust is already established.',
  },
  {
    label: 'Written commitments',
    title: 'Every cashback or offer in writing',
    body: 'If a representative offers you a discount, extended tenure, or promotional slot, it\'s captured as a signed PDF in your account before it applies. Verbal promises are invalid — for your protection.',
  },
  {
    label: 'Buyer identity',
    title: 'Enquiries only from real accounts',
    body: 'Buyers must be signed in and phone-verified before contacting a seller. Junk leads and phantom enquiries from throwaway numbers do not reach your dashboard.',
  },
];

interface Faq {
  q: string;
  a: string;
}

const FAQS: Faq[] = [
  {
    q: 'How long does verification take?',
    a: 'Twenty-four hours on business days for a complete submission. Incomplete submissions come back with a specific list of what\'s missing — verification is not a queue you disappear into.',
  },
  {
    q: 'What documents do I need to upload?',
    a: 'Sale deed, latest tax receipt, and encumbrance certificate for a resale property. RERA registration if the project is under construction. Occupancy certificate for apartments. All uploads are encrypted; only the assigned verification officer can view them, and every access is logged.',
  },
  {
    q: 'Is listing free?',
    a: 'Yes, the Free tier is unlimited — every listing goes through the same officer-reviewed verification. The Featured tier is optional and adds top-of-locality search placement plus enquiry-priority for six months.',
  },
  {
    q: 'What if my property is under construction?',
    a: 'That\'s a project rather than a listing — sign up as a BUILDER and submit the project along with its RERA registration, plans, and unit configurations. Verification for projects checks the RERA record on the TSRERA portal.',
  },
  {
    q: 'Do I need to be present for verification?',
    a: 'No. Verification is document-based. If a physical inspection is required (rare, only for specific title concerns), the officer contacts you to schedule.',
  },
];

export default function SellLandingPage() {
  return (
    <div className="mx-auto max-w-[64rem] px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-3xl">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2.25rem] text-ink sm:text-[3rem]">
          Sell your home the way it should have always worked
        </h1>
        <p className="mt-5 text-[1.0625rem] leading-relaxed text-muted">
          A SellEasy24 verification officer reads your ownership documents
          against the listing before it goes public. Every buyer who sends
          you an enquiry has already been verified themselves. Nothing
          appears unchecked; nothing reaches you unfiltered.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/seller/listings"
            className="rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
          >
            List your property
          </Link>
          <Link
            href="/plans"
            className="rounded-control border border-line bg-surface px-5 py-2.5 text-[0.9375rem] font-medium text-ink transition-colors hover:border-muted"
          >
            See listing plans
          </Link>
          <Link
            href="/tools/valuation"
            className="rounded-control border border-line bg-surface px-5 py-2.5 text-[0.9375rem] font-medium text-ink transition-colors hover:border-muted"
          >
            Estimate your property value
          </Link>
        </div>
      </header>

      <section aria-labelledby="why-heading" className="mt-16">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="why-heading" className="display text-[1.625rem] text-ink">
          Why sellers choose SellEasy24
        </h2>

        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {WHY_SELLEASY.map((item) => (
            <li
              key={item.label}
              className="rounded-card bg-surface p-6 shadow-card ring-1 ring-line"
            >
              <p className="label text-verify">{item.label}</p>
              <h3 className="mt-2 display text-[1.125rem] text-ink">
                {item.title}
              </h3>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="steps-heading" className="mt-16">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="steps-heading" className="display text-[1.625rem] text-ink">
          How to list — five steps, one verification
        </h2>
        <p className="mt-2 text-[0.9375rem] text-muted">
          From account creation to your first enquiry, typically inside a
          business week.
        </p>

        <ol className="mt-8 space-y-4">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="flex gap-4 rounded-card bg-surface p-6 shadow-card ring-1 ring-line"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-action text-[0.9375rem] font-semibold text-white">
                {step.n}
              </span>
              <div>
                <p className="text-[1rem] font-semibold text-ink">{step.title}</p>
                <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="help-heading"
        className="mt-16 rounded-card bg-verify-soft p-8 ring-1 ring-verify/25 sm:p-10"
      >
        <p className="label text-verify-ink">Not comfortable listing yourself?</p>
        <h2
          id="help-heading"
          className="mt-3 display text-[1.375rem] text-ink"
        >
          A SellEasy24 field agent can list your property for you
        </h2>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink/85">
          Owners who can&rsquo;t upload photos and paperwork themselves can
          request a verified field agent. The agent visits your property,
          photographs it, collects the required documents, and lists on your
          behalf. You approve the listing and pay a small service fee only
          when it goes live.
        </p>
        <div className="mt-6">
          <a
            href="mailto:hello@selleasy24.com?subject=Request%20a%20SellEasy24%20field%20agent"
            className="inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
          >
            Request an agent
          </a>
          <span className="ml-4 text-[0.875rem] text-muted">
            or email hello@selleasy24.com
          </span>
        </div>
      </section>

      <section aria-labelledby="disclosure-heading" className="mt-16 max-w-[46rem]">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="disclosure-heading" className="display text-[1.5rem] text-ink">
          What verification does — and does not — cover
        </h2>
        <div className="mt-6 space-y-4 text-[0.9375rem] leading-relaxed text-muted">
          <p>
            <strong className="text-ink">What is checked:</strong> the sale
            deed names you as the current owner; the encumbrance certificate
            shows no undischarged charges against the property; the address
            and configuration on the listing match the deed; the RERA
            registration (for projects) resolves on the TSRERA portal and is
            currently valid.
          </p>
          <p>
            <strong className="text-ink">What is not:</strong> we do not
            physically inspect the property, we do not appraise structural
            integrity, and we do not underwrite the transaction. A buyer&rsquo;s
            own site visit and their lender&rsquo;s technical evaluation
            remain necessary — the platform reduces documentation risk, not
            all risk.
          </p>
        </div>
      </section>

      <section aria-labelledby="faq-heading" className="mt-16">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="faq-heading" className="display text-[1.5rem] text-ink">
          Common questions
        </h2>

        <dl className="mt-6 divide-y divide-line-soft">
          {FAQS.map((item) => (
            <div key={item.q} className="py-5">
              <dt className="text-[1rem] font-semibold text-ink">{item.q}</dt>
              <dd className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="cta-heading"
        className="mt-16 rounded-card bg-action p-8 text-white sm:p-10"
      >
        <h2
          id="cta-heading"
          className="display text-[1.5rem] text-white"
        >
          Ready to list?
        </h2>
        <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-white/80">
          Sign in or create an account to draft your first listing. Every
          field is optional at the draft stage — save what you have and
          continue when it suits you.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/seller/listings"
            className="rounded-control bg-verify px-5 py-2.5 text-[0.9375rem] font-semibold text-verify-ink transition-transform duration-200 hover:-translate-y-px"
          >
            Start a listing
          </Link>
          <Link
            href="/login"
            className="rounded-control border border-white/30 px-5 py-2.5 text-[0.9375rem] font-medium text-white transition-colors hover:bg-white/10"
          >
            Sign in
          </Link>
        </div>
      </section>
    </div>
  );
}
