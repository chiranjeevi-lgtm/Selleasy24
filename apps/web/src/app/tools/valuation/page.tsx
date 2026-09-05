import type { Metadata } from 'next';
import Link from 'next/link';
import { ValuationCalculator } from '@/components/valuation-calculator';

export const metadata: Metadata = {
  title: 'Property valuation · Estimate your Hyderabad home\'s value',
  description:
    'Enter a locality, configuration and area — get an estimated value range computed from verified listings on SellEasy24. Not a black-box guess.',
};

export default function ValuationPage() {
  return (
    <div className="mx-auto max-w-[64rem] px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-2xl">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2.25rem] text-ink sm:text-[3rem]">
          What is your home worth?
        </h1>
        <p className="mt-5 text-[1.0625rem] leading-relaxed text-muted">
          A comparables-based estimate for any residential address in
          Hyderabad. We compute the range from verified listings currently on
          SellEasy24 — not third-party aggregators, not the seller&rsquo;s
          asking price, not a black-box model.
        </p>
      </header>

      <section aria-labelledby="tool-heading" className="mt-12">
        <div className="mb-6 flex items-baseline gap-3">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-action text-[0.8125rem] font-semibold text-white"
          >
            1
          </span>
          <div>
            <h2 id="tool-heading" className="display text-[1.5rem] text-ink">
              Tell us about the property
            </h2>
            <p className="mt-1 text-[0.875rem] text-muted">
              We&rsquo;ll match against verified listings within similar
              configuration and area.
            </p>
          </div>
        </div>
        <ValuationCalculator />
      </section>

      <section
        aria-labelledby="how-heading"
        className="mt-16 rounded-card bg-verify-soft p-8 ring-1 ring-verify/25 sm:p-10"
      >
        <p className="label text-verify-ink">How this works</p>
        <h2 id="how-heading" className="mt-3 display text-[1.375rem] text-ink">
          Comparables model, not a black-box AI
        </h2>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink/85">
          We pull verified listings in your chosen locality that match your
          configuration within ±1 BHK and ±20% area. Each comparable gets a
          weight based on distance (when coordinates are provided), how
          exactly the configuration matches, area similarity, and how recent
          the listing is. The 25th, 50th and 75th percentiles of the
          weighted price-per-sqft become the low, mid, and high of the
          range.
        </p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink/85">
          If fewer than five comparables match, we don&rsquo;t publish a
          number — the confidence tier drops to &ldquo;insufficient&rdquo;
          rather than fabricating one.
        </p>
      </section>

      <section
        aria-labelledby="next-heading"
        className="mt-16 rounded-card bg-action p-8 text-white sm:p-10"
      >
        <h2 id="next-heading" className="display text-[1.5rem] text-white">
          Selling? List with a realistic price
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/80">
          Sellers on SellEasy24 who list within 5% of the mid estimate close
          twice as fast as those who list 20% above. When you&rsquo;re ready,
          we&rsquo;ll walk you through submitting your property for
          verification.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/seller/listings"
            className="rounded-control bg-verify px-5 py-2.5 text-[0.9375rem] font-semibold text-verify-ink transition-transform duration-200 hover:-translate-y-px"
          >
            List your property
          </Link>
          <Link
            href="/plans"
            className="rounded-control border border-white/30 px-5 py-2.5 text-[0.9375rem] font-medium text-white transition-colors hover:bg-white/10"
          >
            See listing plans
          </Link>
        </div>
      </section>
    </div>
  );
}
