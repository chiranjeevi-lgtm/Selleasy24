import type { Metadata } from 'next';
import Link from 'next/link';
import {
  EMICalculator,
  EligibilityCalculator,
} from '@/components/loan-calculators';
import { ApiError } from '@/lib/api';
import { serverApi, type BuyerProfile } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'EMI & eligibility calculator · Plan your Hyderabad home loan',
  description:
    'Work out your monthly EMI, total interest cost, and how much you can borrow. Client-side only — nothing you enter leaves your device.',
};

/**
 * Loan planning tools.
 *
 * Two calculators, stacked. The EMI one comes first because "what will I
 * pay per month?" is the question buyers walk in with — eligibility is
 * downstream ("how much can I get?"). Both are pure client-side; the page
 * shell is a server component so metadata and static content render at
 * build time.
 *
 * When Phase 5 financing partnerships land, an "Apply now" button on each
 * result panel routes to the multi-lender application form with these
 * numbers pre-filled. That's a component prop change, not a rewrite.
 */

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'How is the EMI calculated?',
    a: 'The standard reducing-balance formula that Indian banks use: EMI = P × r × (1+r)ⁿ / ((1+r)ⁿ − 1), where P is the loan amount, r is the monthly interest rate, and n is the tenure in months. If the rate is zero (rare — used for some subsidy schemes), EMI is simply loan amount divided by months.',
  },
  {
    q: 'What is FOIR and why 55%?',
    a: 'Fixed Obligations to Income Ratio — the share of your income a bank will let you commit to EMIs. Most Indian lenders cap it between 50% and 60% for salaried borrowers. We use 55% as a middle-of-the-road number; a lender may allow more if you earn above ₹2 L/month, or less if your existing EMIs are high.',
  },
  {
    q: 'Does the calculator save my inputs?',
    a: 'No. Everything runs in your browser — nothing is sent to our servers, nothing is stored. Refresh the page and the inputs reset. This is deliberate: a loan calculator is a decision tool, not a data-collection funnel.',
  },
  {
    q: 'Are the numbers exact?',
    a: 'The EMI figure is exact for the rate and tenure you entered. Real-life EMIs may differ because processing fees, insurance premiums, and floating-rate adjustments change the actual monthly outgo. Treat the output as accurate for planning, not for signing.',
  },
];

export default async function EMICalculatorPage() {
  // If the visitor is a signed-in buyer with a saved profile, we pre-fill
  // the sliders with the numbers they already gave us. Anonymous visitors
  // (and buyers who haven't started the profile) see the same defaults as
  // before. Fetch fails silently — a broken profile call must not block a
  // pure client-side calculator from loading.
  let profile: BuyerProfile | null = null;
  try {
    profile = await serverApi.buyerProfile();
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    // 401 (signed out) and 404 (no profile started) both fall through.
    profile = null;
  }

  const personalised =
    profile !== null &&
    (profile.budgetMax !== null || profile.monthlyIncome !== null);

  const emiDefaults = personalised
    ? { principal: profile?.budgetMax ?? undefined }
    : undefined;
  const eligibilityDefaults = personalised
    ? { monthlyIncome: profile?.monthlyIncome ?? undefined }
    : undefined;

  return (
    <div className="mx-auto max-w-[64rem] px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-2xl">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2.25rem] text-ink sm:text-[3rem]">
          Plan your home loan
        </h1>
        <p className="mt-5 text-[1.0625rem] leading-relaxed text-muted">
          Two calculators — one for your monthly EMI on a specific loan
          amount, one for the biggest loan you could qualify for. Everything
          runs in your browser; nothing you type here leaves your device.
        </p>
      </header>

      {personalised && (
        <div className="mt-8 flex items-start gap-3 rounded-card bg-verify-soft p-4 ring-1 ring-verify/25">
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-verify"
          >
            <path
              d="M4 10.5 8.5 15 16 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <p className="text-[0.9375rem] font-semibold text-ink">
              Personalised for you
            </p>
            <p className="mt-1 text-[0.875rem] leading-relaxed text-muted">
              Sliders below are pre-filled from your buyer profile
              {profile?.budgetMax !== null &&
              profile?.budgetMax !== undefined
                ? ` — loan amount from your target budget ₹${(profile.budgetMax / 100_000).toFixed(1)}L`
                : ''}
              {profile?.monthlyIncome !== null &&
              profile?.monthlyIncome !== undefined
                ? ` — income from your profile ₹${(profile.monthlyIncome / 100_000).toFixed(1)}L/mo`
                : ''}
              . Adjust freely — nothing you change here is saved back.
            </p>
          </div>
        </div>
      )}

      <section aria-labelledby="emi-heading" className="mt-12">
        <div className="mb-6 flex items-baseline gap-3">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-action text-[0.8125rem] font-semibold text-white"
          >
            1
          </span>
          <div>
            <h2 id="emi-heading" className="display text-[1.5rem] text-ink">
              What will my EMI be?
            </h2>
            <p className="mt-1 text-[0.875rem] text-muted">
              For a specific loan amount, tenure, and interest rate.
            </p>
          </div>
        </div>
        <EMICalculator defaults={emiDefaults} />
      </section>

      <section aria-labelledby="eligibility-heading" className="mt-16">
        <div className="mb-6 flex items-baseline gap-3">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-action text-[0.8125rem] font-semibold text-white"
          >
            2
          </span>
          <div>
            <h2 id="eligibility-heading" className="display text-[1.5rem] text-ink">
              How much can I borrow?
            </h2>
            <p className="mt-1 text-[0.875rem] text-muted">
              Based on your income and existing commitments.
            </p>
          </div>
        </div>
        <EligibilityCalculator defaults={eligibilityDefaults} />
      </section>

      <section
        aria-labelledby="commitment-heading"
        className="mt-16 rounded-card bg-verify-soft p-8 ring-1 ring-verify/25 sm:p-10"
      >
        <p className="label text-verify-ink">Fair-practice note</p>
        <h2 id="commitment-heading" className="mt-3 display text-[1.375rem] text-ink">
          Rates and offers, in writing only
        </h2>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink/85">
          If anyone claiming to represent SellEasy24 quotes you a rate,
          processing-fee waiver, or cashback verbally, ask for it in writing
          before you act on it. Once our financing partnerships go live, every
          offer you see on this platform will be captured as a signed PDF at
          the moment it&rsquo;s made — the same principle as every other
          promise on the site.
        </p>
      </section>

      <section aria-labelledby="faq-heading" className="mt-16">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h2 id="faq-heading" className="display text-[1.5rem] text-ink">
          How this works
        </h2>
        <dl className="mt-6 divide-y divide-line-soft">
          {FAQ.map((item) => (
            <div key={item.q} className="py-5">
              <dt className="text-[1rem] font-semibold text-ink">{item.q}</dt>
              <dd className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="next-heading"
        className="mt-16 rounded-card bg-action p-8 text-white sm:p-10"
      >
        <h2 id="next-heading" className="display text-[1.5rem] text-white">
          Ready to actually apply?
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/80">
          We&rsquo;re onboarding lending partners now. When the multi-lender
          application flow goes live, your inputs here will pre-fill the
          form. Meanwhile, browse verified homes to shortlist against these
          numbers.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-control bg-verify px-5 py-2.5 text-[0.9375rem] font-semibold text-verify-ink transition-transform duration-200 hover:-translate-y-px"
          >
            Browse verified homes
          </Link>
          <Link
            href="/localities"
            className="rounded-control border border-white/30 px-5 py-2.5 text-[0.9375rem] font-medium text-white transition-colors hover:bg-white/10"
          >
            See locality rates
          </Link>
        </div>
      </section>
    </div>
  );
}
