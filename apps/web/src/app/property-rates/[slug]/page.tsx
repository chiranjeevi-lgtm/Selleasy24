import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, type Locality } from '@/lib/api';
import { findLocalityBySlug } from '@/lib/hyderabad-localities';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Price-rate micro-page.
 *
 * One H1, one number, one delta. Deliberately small: this URL exists to own
 * rate-lookup search intent ("Kondapur property rate 2026"), not to be a
 * second locality overview page. Everything else on it is one link away
 * from the full locality guide.
 *
 * The rate comes from the Locality API which the schema already computes.
 * If no rate is available, the page still renders with a "coming soon"
 * treatment rather than 404-ing — a search-engine-indexed URL that vanishes
 * is worse than one that shows a placeholder.
 */

function formatRate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) return null;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

const MONTH_YEAR = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locality = findLocalityBySlug(slug);
  if (!locality) return { title: 'Locality not found' };
  return {
    title: `${locality.name} property rates · ₹/sqft ${MONTH_YEAR.format(new Date())}`,
    description: `Latest property rate per square foot in ${locality.name}, Hyderabad, computed from verified listings on SellEasy24.`,
  };
}

export default async function PropertyRatePage({ params }: PageProps) {
  const { slug } = await params;
  const locality = findLocalityBySlug(slug);
  if (!locality) notFound();

  const apiLocalities = await api
    .localities('Hyderabad')
    .catch((): Locality[] => []);

  const apiMatch = apiLocalities.find(
    (l) => l.name.toLowerCase() === locality.name.toLowerCase(),
  );
  const rate = formatRate(apiMatch?.medianPricePerSqft);
  const sampleSize = apiMatch?.medianSampleSize ?? 0;
  const asOf = MONTH_YEAR.format(new Date());

  return (
    <div className="mx-auto max-w-[46rem] px-5 py-12 sm:px-8 sm:py-16">
      <nav aria-label="Breadcrumb" className="mb-5 text-[0.875rem]">
        <Link
          href="/localities"
          className="text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← All localities
        </Link>
      </nav>

      <header>
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2rem] text-ink sm:text-[2.5rem]">
          {locality.name} property rates
        </h1>
        <p className="mt-3 text-[0.9375rem] text-muted">
          Median ₹ per square foot, computed from verified listings on
          SellEasy24. Last updated {asOf}.
        </p>
      </header>

      <section
        aria-labelledby="rate-heading"
        className="mt-8 rounded-card bg-surface p-8 shadow-card ring-1 ring-line sm:p-10"
      >
        <p id="rate-heading" className="label text-faint">
          Median rate
        </p>
        {rate ? (
          <p className="mt-3 tabular display text-[3.5rem] text-ink sm:text-[4.5rem]">
            {rate}
            <span className="ml-2 text-[1.125rem] font-normal text-muted">
              /sqft
            </span>
          </p>
        ) : (
          <p className="mt-3 display text-[1.75rem] text-muted">
            Rate coming soon — awaiting verified inventory
          </p>
        )}

        {sampleSize > 0 && (
          <p className="mt-4 text-[0.9375rem] text-muted">
            From {sampleSize} verified listing{sampleSize === 1 ? '' : 's'} in{' '}
            {locality.name}.
          </p>
        )}

        <p className="mt-6 border-t border-line-soft pt-4 text-[0.8125rem] leading-relaxed text-faint">
          Every listing that feeds this figure has been checked by a
          SellEasy24 verification officer against the seller&rsquo;s ownership
          documents. Rate updates as new listings are verified — nothing here
          comes from third-party estimates.
        </p>
      </section>

      <section
        aria-labelledby="cta-heading"
        className="mt-10 rounded-card bg-action p-8 text-white"
      >
        <h2 id="cta-heading" className="display text-[1.375rem] text-white">
          More than just the rate
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/80">
          The full {locality.name} guide covers connectivity, pros and cons,
          the typical buyer profile, and every project we&rsquo;ve verified in
          the area.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/localities/${slug}`}
            className="rounded-control bg-verify px-5 py-2.5 text-[0.9375rem] font-semibold text-verify-ink transition-transform duration-200 hover:-translate-y-px"
          >
            Read the full guide
          </Link>
          {apiMatch && (
            <Link
              href={`/?neighborhoodId=${apiMatch.id}`}
              className="rounded-control border border-white/30 px-5 py-2.5 text-[0.9375rem] font-medium text-white transition-colors hover:bg-white/10"
            >
              Browse verified homes
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
