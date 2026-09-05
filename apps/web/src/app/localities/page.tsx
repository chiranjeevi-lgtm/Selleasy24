import type { Metadata } from 'next';
import Link from 'next/link';
import { api, type Locality } from '@/lib/api';
import {
  KNOWN_LOCALITIES,
  localitySlug,
} from '@/lib/hyderabad-localities';
import { LOCALITY_CONTENT } from '@/lib/locality-content';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Hyderabad localities · Verified home guides by area',
  description:
    'Every locality we serve in Hyderabad — with price rates, connectivity, buyer profile, and live verified inventory. Kondapur to Kokapet, Gachibowli to Narsingi.',
};

/**
 * Locality directory.
 *
 * The list is the curated Hyderabad set — the same 27 centroids the map
 * page uses. Ordering: localities with editorial content first (those are
 * the ones a buyer actually gets useful writing on), then alphabetical.
 *
 * The `medianPricePerSqft` shown per row comes from the Locality API when
 * available — the schema already computes it. Localities that haven't
 * accumulated enough sample data show a neutral "rate coming soon" chip
 * rather than a fake number.
 */

function formatRate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) return null;
  return `₹${Math.round(n).toLocaleString('en-IN')}/sqft`;
}

export default async function LocalitiesIndexPage() {
  const apiLocalities = await api
    .localities('Hyderabad')
    .catch((): Locality[] => []);

  const rateByName = new Map<string, string | number | null>();
  for (const locality of apiLocalities) {
    rateByName.set(locality.name.toLowerCase(), locality.medianPricePerSqft);
  }

  const entries = KNOWN_LOCALITIES.map((locality) => {
    const slug = localitySlug(locality.name);
    const editorial = LOCALITY_CONTENT[slug];
    return {
      name: locality.name,
      slug,
      hasEditorial: Boolean(editorial),
      headline: editorial?.headline,
      rate: formatRate(rateByName.get(locality.name.toLowerCase())),
    };
  }).sort((a, b) => {
    if (a.hasEditorial !== b.hasEditorial) return a.hasEditorial ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-2xl">
        <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
        <h1 className="display text-[2.25rem] text-ink sm:text-[3rem]">
          Hyderabad, locality by locality
        </h1>
        <p className="mt-5 text-[1.0625rem] leading-relaxed text-muted">
          Real writing on the places we cover — what buying looks like there,
          what the trade-offs are, and what the market is doing today. Every
          rate on this page is from actual listings on SellEasy24, not a
          third-party aggregator.
        </p>
      </header>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <li key={entry.slug}>
            <Link
              href={`/localities/${entry.slug}`}
              className="group flex h-full flex-col justify-between rounded-card bg-surface p-6 shadow-card ring-1 ring-line transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div>
                <p className="display text-[1.25rem] text-ink">{entry.name}</p>
                {entry.headline ? (
                  <p className="mt-2 text-[0.9375rem] leading-snug text-muted">
                    {entry.headline}
                  </p>
                ) : (
                  <p className="mt-2 text-[0.875rem] text-faint">
                    Locality guide coming — inventory available now
                  </p>
                )}
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-line-soft pt-4">
                {entry.rate ? (
                  <span className="tabular text-[0.875rem] font-semibold text-ink">
                    {entry.rate}
                  </span>
                ) : (
                  <span className="text-[0.75rem] uppercase tracking-[0.08em] text-faint">
                    Rate coming soon
                  </span>
                )}
                <span className="text-[0.8125rem] text-verify transition-transform duration-300 group-hover:translate-x-0.5">
                  Read →
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
