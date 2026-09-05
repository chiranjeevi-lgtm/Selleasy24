import type { Metadata } from 'next';
import Link from 'next/link';
import { api, type Locality, type SearchResult } from '@/lib/api';
import { ListingCardItem } from '@/components/listing-card';
import { LocalityPicker } from '@/components/locality-picker';
import { SortControls, RENT_SORT_OPTIONS } from '@/components/sort-controls';
import { serverApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Zero-brokerage rentals on SellEasy24 · Hyderabad',
  description:
    'Verified rental homes in Hyderabad. Every owner checked against ownership documents, every deposit shown as a number. Filter by locality, rent, tenant preference, and zero-brokerage.',
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const RENT_FILTER_KEYS = [
  'neighborhoodId',
  'propertyType',
  'bedrooms',
  'minRent',
  'maxRent',
  'maxDepositMonths',
  'tenantPreference',
  'petsAllowed',
  'zeroBrokerage',
  'furnishing',
  'availableFrom',
  // `sort` travels the same URL round-trip as filters; without it, the sort
  // chips navigate but the API never receives the value and results stay in
  // the default order.
  'sort',
] as const;

const MULTI_VALUE_KEYS = new Set<string>([
  'propertyType',
  'bedrooms',
  // Multi-select locality — repeated `neighborhoodId=` params travel here
  // as arrays, join to a comma-string so the value round-trips as a single
  // URL param onwards through the API call.
  'neighborhoodId',
]);

/**
 * `/rent` — real search grid over `kind = RENT` inventory.
 *
 * Replaced the previous "coming soon" positioning page. Reuses the shared
 * ListingCardItem (which now dispatches on `kind` to render monthly rent
 * and deposit-in-months for rentals) so a rental card sits alongside a
 * sale card without design divergence.
 *
 * Filter panel here is a focused subset of the sale-side filters — rent
 * buyers rarely care about "possession date" or "approving authority"
 * (a rental is by definition ready-to-move; RERA is a purchase concern).
 * Rent-specific filters (deposit, tenant preference, zero brokerage) live
 * inline on this page rather than in the generic FilterPanel so the sale
 * surface stays uncluttered.
 */
export default async function RentPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const values: Record<string, string | undefined> = {};
  for (const key of RENT_FILTER_KEYS) {
    const raw = params[key];
    const value =
      MULTI_VALUE_KEYS.has(key) && Array.isArray(raw)
        ? raw.filter(Boolean).join(',')
        : first(raw);
    if (value) values[key] = value;
  }

  const [localities, results] = await Promise.all([
    api.localities('Hyderabad').catch((): Locality[] => []),
    api
      .searchListings({
        city: 'Hyderabad',
        kind: 'RENT',
        ...values,
        limit: '24',
      })
      .catch((): SearchResult => ({ total: 0, limit: 24, offset: 0, items: [] })),
  ]);

  const isFiltered = Object.keys(values).length > 0;

  const savedIds = await serverApi
    .savedIds()
    .then((r) => new Set(r.ids))
    .catch(() => new Set<string>());

  return (
    <div>
      <section className="relative bg-action text-white">
        <div className="mx-auto max-w-[76rem] px-5 py-14 sm:px-8 sm:py-20">
          <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
          <p className="label text-verify">Rent in Hyderabad</p>
          <h1 className="mt-4 display text-[2.5rem] leading-tight text-white sm:text-[3.5rem]">
            Zero-brokerage rentals,<br />verified owners.
          </h1>
          <p className="mt-5 max-w-2xl text-[1rem] leading-relaxed text-white/80 sm:text-[1.0625rem]">
            Every rental home on SellEasy24 has its owner checked against ownership
            documents before it appears. Deposits are shown as a number of months —
            no &ldquo;negotiable&rdquo;, no phantom fees. Your number goes only to
            the one owner you contact.
          </p>
        </div>
      </section>

      {/* Filter bar — a plain GET form, same pattern as the sale-side homepage. */}
      <div className="mx-auto max-w-[76rem] px-5 pt-8 sm:px-8">
        <form method="get" action="/rent" className="rounded-card bg-surface p-4 shadow-card ring-1 ring-line sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Locality — multi-select typeahead. Rendered inside a bordered
                cell so it visually matches the sibling <select> fields on
                the same row. */}
            <div className="rounded-control border border-line">
              <LocalityPicker
                localities={localities}
                selectedIds={(values.neighborhoodId ?? '')
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean)}
              />
            </div>

            {/* Bedrooms */}
            <label className="block">
              <span className="label text-faint">Bedrooms</span>
              <select
                name="bedrooms"
                defaultValue={values.bedrooms ?? ''}
                className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none focus:border-action"
              >
                <option value="">Any</option>
                <option value="1">1 BHK</option>
                <option value="2">2 BHK</option>
                <option value="3">3 BHK</option>
                <option value="4">4 BHK</option>
                <option value="5">5+ BHK</option>
              </select>
            </label>

            {/* Max monthly rent */}
            <label className="block">
              <span className="label text-faint">Max rent (₹/mo)</span>
              <select
                name="maxRent"
                defaultValue={values.maxRent ?? ''}
                className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none focus:border-action"
              >
                <option value="">No max</option>
                <option value="15000">₹15,000</option>
                <option value="25000">₹25,000</option>
                <option value="40000">₹40,000</option>
                <option value="60000">₹60,000</option>
                <option value="100000">₹1,00,000</option>
                <option value="200000">₹2,00,000</option>
              </select>
            </label>

            {/* Max deposit (in months) */}
            <label className="block">
              <span className="label text-faint">Max deposit</span>
              <select
                name="maxDepositMonths"
                defaultValue={values.maxDepositMonths ?? ''}
                className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none focus:border-action"
              >
                <option value="">Any</option>
                <option value="1">1 month</option>
                <option value="2">2 months</option>
                <option value="3">3 months</option>
                <option value="6">6 months</option>
              </select>
            </label>

            {/* Tenant preference */}
            <label className="block">
              <span className="label text-faint">Who's renting</span>
              <select
                name="tenantPreference"
                defaultValue={values.tenantPreference ?? ''}
                className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none focus:border-action"
              >
                <option value="">Anyone</option>
                <option value="FAMILY">Family</option>
                <option value="BACHELOR_MALE">Bachelor · male</option>
                <option value="BACHELOR_FEMALE">Bachelor · female</option>
                <option value="COMPANY">Company lease</option>
              </select>
            </label>

            {/* Furnishing */}
            <label className="block">
              <span className="label text-faint">Furnishing</span>
              <select
                name="furnishing"
                defaultValue={values.furnishing ?? ''}
                className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink outline-none focus:border-action"
              >
                <option value="">Any</option>
                <option value="FULLY_FURNISHED">Fully furnished</option>
                <option value="SEMI_FURNISHED">Semi furnished</option>
                <option value="UNFURNISHED">Unfurnished</option>
              </select>
            </label>

            {/* Zero brokerage toggle */}
            <label className="flex items-center gap-2 self-end pb-2">
              <input
                type="checkbox"
                name="zeroBrokerage"
                value="true"
                defaultChecked={values.zeroBrokerage === 'true'}
                className="h-4 w-4 rounded border-line text-action focus:ring-action"
              />
              <span className="text-[0.875rem] text-ink">Zero brokerage only</span>
            </label>

            {/* Pets allowed toggle */}
            <label className="flex items-center gap-2 self-end pb-2">
              <input
                type="checkbox"
                name="petsAllowed"
                value="true"
                defaultChecked={values.petsAllowed === 'true'}
                className="h-4 w-4 rounded border-line text-action focus:ring-action"
              />
              <span className="text-[0.875rem] text-ink">Pets allowed</span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-control bg-action px-5 py-2 text-[0.875rem] font-semibold text-white transition-colors hover:bg-action-hover"
            >
              Search rentals
            </button>
            {isFiltered && (
              <Link
                href="/rent"
                className="rounded-control border border-line px-4 py-2 text-[0.875rem] font-medium text-ink transition-colors hover:bg-canvas-deep"
              >
                Clear filters
              </Link>
            )}
          </div>
        </form>
      </div>

      <section className="mx-auto max-w-[76rem] px-5 pt-10 sm:px-8" aria-label="Rentals">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
            <h2 className="display text-[1.625rem] text-ink">
              {results.total === 0
                ? 'No rentals match yet'
                : `${results.total} verified ${results.total === 1 ? 'rental' : 'rentals'} in Hyderabad`}
            </h2>
            {results.total > 0 && (
              <p className="mt-1.5 text-[0.9375rem] text-muted">
                Every one has its owner checked against ownership documents.
              </p>
            )}
          </div>

          {/* Sort by rent, not sale price — rent screens surface a different
              axis (rentAsc/rentDesc) that the sale variant doesn't offer. */}
          {results.items.length > 0 && (
            <SortControls values={values} action="/rent" options={RENT_SORT_OPTIONS} />
          )}
        </div>

        {results.items.length === 0 ? (
          <div className="mt-8 rounded-card border border-dashed border-line bg-surface px-6 py-20 text-center">
            <p className="text-[1.0625rem] font-medium text-ink">
              {isFiltered ? 'Nothing matches those filters yet' : 'No rentals live yet'}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-muted">
              {isFiltered
                ? 'Try a wider rent range or a different locality — verified rental inventory is still growing.'
                : 'Rentals appear here once an officer has checked the owner’s documents. If you own a property to rent, list it below and we’ll fast-track verification.'}
            </p>
            {!isFiltered && (
              <Link
                href="/seller/listings/new"
                className="mt-6 inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
              >
                List a rental
              </Link>
            )}
          </div>
        ) : (
          <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {results.items.map((listing) => (
              <li key={listing.id}>
                <ListingCardItem listing={listing} isSaved={savedIds.has(listing.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mx-auto mt-16 max-w-[76rem] px-5 pb-16 sm:px-8">
        <div className="rounded-card bg-verify-soft p-8 ring-1 ring-verify/25 sm:p-10">
          <p className="label text-verify-ink">Own a home to rent out?</p>
          <h2 className="mt-3 display text-[1.375rem] text-ink">
            Verified owners get first pick of verified tenants.
          </h2>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink/85">
            The same officer-reviewed verification applied to your side of the
            transaction. Owners who list early get a free six-month Featured
            slot on their first rental.
          </p>
          <div className="mt-6">
            <Link
              href="/seller/listings"
              className="inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
            >
              List your rental
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
