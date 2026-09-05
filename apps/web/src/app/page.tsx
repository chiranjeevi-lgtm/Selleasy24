import Link from 'next/link';
import { api, type Locality, type SearchResult } from '@/lib/api';
import { ListingCardItem } from '@/components/listing-card';
import { Recommended, RecommendationsPrompt } from '@/components/recommended';
import { AppliedFilters, FilterPanel } from '@/components/search-filters';
import { InsightsDashboard } from '@/components/insights-dashboard';
import { LocalityPicker } from '@/components/locality-picker';
import { PropertyPicker } from '@/components/property-picker';
import { SaveSearchForm } from '@/components/save-search-form';
import { SortControls } from '@/components/sort-controls';
import { serverApi } from '@/lib/server-api';
import { jsonLdScript, siteLocalBusinessLd } from '@/lib/structured-data';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Photo keys come back relative; the browser needs the API host in front. */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function absolutePhotoUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

/*
 * A bare `appearance-none` select still renders the operating system's own list
 * when opened, which is the single cheapest-looking element on the page. The
 * chevron is drawn as a background image so the control reads as designed at
 * rest, and bedrooms — the most-used filter — is pills instead, removing that
 * dropdown entirely.
 */
const selectClass =
  "w-full cursor-pointer appearance-none bg-transparent bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 4.5 6 8.5 10 4.5' fill='none' stroke='%236b7078' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")] bg-[length:12px] bg-[right_center] bg-no-repeat pr-6 text-[0.9375rem] font-medium text-ink outline-none";

function RupeeIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-verify">
      <path
        d="M4.5 3h7M4.5 6h7M10 3c0 3-2 4.5-5.5 4.5L11 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Comma-separated URL value to a list. */
function splitParam(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * One ladder of budget steps, used for both ends of the range.
 *
 * Shared rather than two hand-written lists so the minimum and maximum can
 * never offer different rungs — which is how a buyer ends up unable to express
 * the range they actually want.
 */
const BUDGET_STEPS = [
  { value: '2500000', label: '₹25 L' },
  { value: '5000000', label: '₹50 L' },
  { value: '7500000', label: '₹75 L' },
  { value: '10000000', label: '₹1 Cr' },
  { value: '15000000', label: '₹1.5 Cr' },
  { value: '20000000', label: '₹2 Cr' },
  { value: '30000000', label: '₹3 Cr' },
  { value: '50000000', label: '₹5 Cr' },
];

/**
 * Search bar.
 *
 * A plain GET form: results are shareable URLs, work without JavaScript, and are
 * indexable — organic search is a primary way buyers arrive at property sites.
 *
 * Property type and configuration live behind one dropdown because both are
 * multi-select, and a row of nine pills spread across the bar would leave no
 * room for anything else.
 */
function SearchBar({
  localities,
  values,
}: {
  localities: Locality[];
  values: Record<string, string | undefined>;
}) {

  return (
    <div className="rounded-card bg-surface p-2 shadow-float sm:p-2.5">
      {/*
        No `overflow-hidden` here, deliberately.

        It was clipping the property dropdown, which is absolutely positioned and
        hangs below this row. The native selects either side were unaffected —
        the browser draws their lists outside the page entirely — so the bug
        looked like "only that one control is broken".

        The corners are rounded on the first and last cells instead, which gets
        the same look without creating a clipping context.
      */}
      <div className="grid gap-px rounded-[10px] bg-line [&>*:first-child]:rounded-t-[10px] [&>*:last-child]:rounded-b-[10px] lg:grid-cols-[1.25fr_1.15fr_1fr_auto] lg:[&>*:first-child]:rounded-l-[10px] lg:[&>*:first-child]:rounded-tr-none lg:[&>*:last-child]:rounded-r-[10px] lg:[&>*:last-child]:rounded-bl-none">
        <LocalityPicker
          localities={localities}
          selectedIds={splitParam(values.neighborhoodId)}
        />

        <PropertyPicker
          selectedTypes={splitParam(values.propertyType)}
          selectedBedrooms={splitParam(values.bedrooms)}
        />

        {/*
          Budget as a range. "Up to" alone hides the bottom of the market from
          anyone who has a floor as well as a ceiling — and buyers with a home
          loan almost always do. The API already accepted minPrice; only the
          interface was one-sided.
        */}
        <div className="bg-surface px-4 py-3">
          <span className="label flex items-center gap-1.5 text-faint">
            <RupeeIcon />
            Budget
          </span>
          <div className="mt-1 flex items-center gap-2">
            <select
              name="minPrice"
              aria-label="Minimum budget"
              defaultValue={values.minPrice ?? ''}
              className={`${selectClass} min-w-0 flex-1`}
            >
              <option value="">No min</option>
              {BUDGET_STEPS.map((step) => (
                <option key={step.value} value={step.value}>{step.label}</option>
              ))}
            </select>

            <span aria-hidden="true" className="shrink-0 text-faint">&ndash;</span>

            <select
              name="maxPrice"
              aria-label="Maximum budget"
              defaultValue={values.maxPrice ?? ''}
              className={`${selectClass} min-w-0 flex-1`}
            >
              <option value="">No max</option>
              {BUDGET_STEPS.map((step) => (
                <option key={step.value} value={step.value}>{step.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex bg-surface p-2">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-action px-7 py-3 text-[0.9375rem] font-semibold text-white transition-all duration-200 hover:bg-action-hover hover:shadow-lift sm:w-auto"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Search
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Filters read straight off the URL.
 *
 * Listed once so the search request, the filter panel and the applied-filter
 * chips all work from the same set — a filter added here reaches all three
 * without being wired up separately in each.
 */
const FILTER_KEYS = [
  'neighborhoodId',
  'propertyType',
  'bedrooms',
  'minBedrooms',
  'minPrice',
  'maxPrice',
  'ownersOnly',
  'possession',
  'furnishing',
  'facing',
  'approvingAuthority',
  'ownership',
  'amenities',
  'minFloor',
  'maxFloor',
  'maxAgeYears',
  // `sort` is a control, not a filter — but it travels the same URL round-trip
  // and the search DTO accepts it. Without this whitelist entry the sort chips
  // navigate correctly but the API never receives the sort value, so results
  // silently stay in the default order.
  'sort',
  // "Near me" — /nearby resolves the browser's geolocation and links here
  // with these three params. The API filters by Haversine distance and
  // auto-sorts closest-first when nearLat/nearLng are present.
  'nearLat',
  'nearLng',
  'radiusKm',
] as const;

/** Filters whose controls are checkbox groups, so several values can arrive. */
const MULTI_VALUE_KEYS = new Set<string>([
  'amenities',
  'propertyType',
  'bedrooms',
  // Locality is now multi-select — repeated `neighborhoodId=` params arrive
  // when the LocalityPicker submits its hidden inputs.
  'neighborhoodId',
]);

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;

  const values: Record<string, string | undefined> = {};
  for (const key of FILTER_KEYS) {
    const raw = params[key];
    /*
     * Multi-value filters arrive as repeated params from their checkbox groups.
     * Taking only the first — as every single-value filter correctly does —
     * would silently drop all but one tick on every submission.
     */
    const value =
      MULTI_VALUE_KEYS.has(key) && Array.isArray(raw)
        ? raw.filter(Boolean).join(',')
        : first(raw);

    if (value) {
      values[key] = value;
    }
  }

  const [localities, results] = await Promise.all([
    api.localities('Hyderabad').catch((): Locality[] => []),
    api
      .searchListings({
        city: 'Hyderabad',
        ...values,
        limit: '24',
      })
      .catch((): SearchResult => ({ total: 0, limit: 24, offset: 0, items: [] })),
  ]);

  const isFiltered = Object.keys(values).length > 0;
  // Multi-select — build an id→name lookup once so applied-filter chips can
  // resolve each selected locality without another loop per chip.
  const localityNames = Object.fromEntries(localities.map((l) => [l.id, l.name]));

  /*
   * Saved state for the whole grid in one request rather than one per card.
   * Signed-out visitors get an empty set — browsing without an account is
   * expected, so a missing session is a normal outcome here, not an error.
   */
  const savedIds = await serverApi
    .savedIds()
    .then((result) => new Set(result.ids))
    .catch(() => new Set<string>());

  /*
   * Recommendations, for a signed-in buyer who has told us something.
   *
   * Suppressed entirely once a filter is applied: someone who has just said
   * "3 BHK in Kondapur under a crore" does not need a row above their results
   * guessing at the same thing.
   *
   * All three calls fail soft. A signed-out visitor is the common case, not an
   * error, and a recommendation strip is never worth failing the home page for.
   */
  const [recommendations, buyerProfile] = isFiltered
    ? [null, null]
    : await Promise.all([
        serverApi.recommendations(6).catch(() => null),
        serverApi.buyerProfile().catch(() => null),
      ]);

  /*
   * Locality tiles, built from the results already fetched rather than from
   * extra queries. Each tile borrows the cover photo of a home in that area, so
   * the row shows real inventory instead of stock imagery.
   *
   * Hidden entirely when a filter is applied — a "browse by area" row is noise
   * once someone has already told us what they want.
   */
  // Listings carry the locality name; the id lives on the reference data already
  // fetched above, so the tiles link to a real filtered search rather than a
  // free-text guess.
  const localityIdByName = new Map(localities.map((l) => [l.name, l.id]));

  const localityTiles = isFiltered
    ? []
    : Object.values(
        results.items.reduce<
          Record<string, { id: string; name: string; count: number; photo?: string }>
        >((acc, listing) => {
          const name = listing.property.locality;
          const id = localityIdByName.get(name);
          if (!id) return acc;

          acc[id] ??= {
            id,
            name,
            count: 0,
            ...(listing.photos[0] && { photo: absolutePhotoUrl(listing.photos[0].url) }),
          };
          acc[id]!.count += 1;
          return acc;
        }, {}),
      )
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 4);

  return (
    <div>
      {/* RealEstateAgent JSON-LD — anchors the brand for a knowledge panel
          on "selleasy24 hyderabad" searches. One tag, static content, no
          per-request cost. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(siteLocalBusinessLd()) }}
      />
      {/*
        Photographic hero. Property is a visual product — the previous
        text-only opening read as a placeholder no matter how good the type was.
        The claim sits over the image because the claim is the differentiator.
      */}
      <section className="relative">
        <div className="relative h-[62vh] min-h-[420px] w-full overflow-hidden sm:h-[68vh]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero.jpg"
            alt=""
            className="h-full w-full object-cover"
            fetchPriority="high"
          />
          {/* Gradient rather than a flat scrim, so the photograph stays legible
              at the top while the type stays readable at the bottom. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/35 to-ink/10"
          />
          {/* Second, horizontal pass. The vertical gradient alone is thin at the
              headline's height, so type landing on a bright sky or foliage
              dropped below readable contrast. This darkens only the text side. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-ink/60 via-ink/20 to-transparent"
          />

          <div className="absolute inset-x-0 bottom-0">
            <div className="mx-auto max-w-[76rem] px-5 pb-12 sm:px-8 sm:pb-16">
              <p className="label text-white/75">
                Every home checked before it appears
              </p>
              <h1 className="display mt-4 max-w-[18ch] text-[2.5rem] text-white sm:text-[4rem]">
                We read the sale deed first.
              </h1>
              <p className="mt-5 max-w-xl text-[1rem] leading-relaxed text-white/80 sm:text-[1.0625rem]">
                A verification officer compares every seller&rsquo;s ownership
                documents against what they claim. You can read the full record on
                each home — no account, no phone number.
              </p>
            </div>
          </div>
        </div>

        {/*
          The search bar straddles the hero edge — it is the first action, so it
          should not be something you scroll to find.

          `relative` is load-bearing, not decoration. The hero above is
          positioned, and positioned elements paint above static siblings no
          matter what the DOM order is — without this the hero covered the top of
          the card and clipped the field labels clean off.
        */}
        <div className="relative z-10 mx-auto -mt-9 max-w-[76rem] px-5 sm:px-8">
          {/*
            One form around the search bar and the filter panel. A plain GET
            form: results are shareable URLs, work without JavaScript, survive
            the back button, and are indexable — organic search is a primary way
            buyers arrive at property sites.
          */}
          <form method="get" action="/">
            <SearchBar localities={localities} values={values} />
            <FilterPanel values={values} />

            {/*
              Filters with no control of their own. Without this they would be
              silently dropped the moment the buyer changed any other filter.
            */}
            {values.ownersOnly && (
              <input type="hidden" name="ownersOnly" value={values.ownersOnly} />
            )}
          </form>

          <AppliedFilters values={values} localityNames={localityNames} />
        </div>
      </section>

      {/*
        Recommendations sit directly under the search, above everything else a
        signed-in buyer might browse — they are the most relevant thing on the
        page for someone who has told us what they want.

        The prompt only appears for a buyer who is signed in and has said
        nothing yet. A signed-out visitor gets neither: asking someone to state
        a budget before they have seen a single property is the wrong order.
      */}
      {recommendations?.personalised && recommendations.items.length > 0 && (
        <Recommended
          items={recommendations.items}
          completedOnboarding={buyerProfile?.completedAt !== null}
        />
      )}

      {recommendations !== null &&
        !recommendations.personalised &&
        buyerProfile !== null && <RecommendationsPrompt />}

      {/*
        Property Price Insights — Feature 10 (Phase 2).

        Sits between the recommendations strip and the locality tiles: it's
        the same "orient the buyer to the market" purpose as tiles, but at
        one level of abstraction higher (city-wide numbers rather than
        specific areas). Client-side because it fetches from three live
        endpoints; hidden on failure so a data blip never blocks the rest
        of the homepage.
      */}
      <InsightsDashboard />

      {/*
        Locality tiles.

        Photographs rather than a text band: this is a visual product, and a row
        of image tiles gives the page somewhere to breathe between the search and
        the results. Each is a real filtered search, not decoration — the count
        comes from the same query the link runs.
      */}
      {localityTiles.length > 0 && (
        <section className="mx-auto max-w-[76rem] px-5 pt-14 sm:px-8" aria-label="Browse by locality">
          <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
          <h2 className="display text-[1.625rem] text-ink">Where people are buying</h2>
          <p className="mt-1.5 text-[0.9375rem] text-muted">
            Every home in these areas has been checked against its ownership documents.
          </p>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {localityTiles.map((tile) => (
              <li key={tile.id}>
                <Link
                  href={`/?neighborhoodId=${tile.id}`}
                  className="group relative block aspect-[4/3] overflow-hidden rounded-card bg-canvas-deep shadow-card ring-1 ring-line transition-all duration-300 hover:shadow-lift"
                >
                  {tile.photo && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={tile.photo}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                      loading="lazy"
                    />
                  )}
                  {/* Gradient rather than a flat scrim so the photograph stays
                      readable at the top while the label stays legible below. */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-action via-action/35 to-transparent"
                  />
                  <span className="absolute inset-x-0 bottom-0 p-4">
                    <span className="block display text-[1.25rem] text-white">{tile.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem] text-white/80">
                      {tile.count} {tile.count === 1 ? 'home' : 'homes'}
                      <span
                        aria-hidden="true"
                        className="transition-transform duration-300 group-hover:translate-x-1"
                      >
                        →
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto max-w-[76rem] px-5 pt-14 sm:px-8" aria-label="Verified homes">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {/* Gold rule above the section heading — structure carrying the
                accent, rather than the accent living only on a badge. */}
            <span aria-hidden="true" className="mb-3 block h-[3px] w-10 bg-verify" />
            <h2 className="display text-[1.625rem] text-ink">
              {results.total === 0
                ? 'No homes match yet'
                : isFiltered
                  ? `${results.total} ${results.total === 1 ? 'home' : 'homes'} match`
                  : 'Verified homes in Hyderabad'}
            </h2>
            {results.total > 0 && (
              <p className="mt-1.5 text-[0.9375rem] text-muted">
                Every one checked against its ownership documents.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {results.items.length > 0 && <SortControls values={values} />}
            {isFiltered && <SaveSearchForm values={values} />}
            {isFiltered && (
              <Link
                href="/"
                className="rounded-control border border-line px-4 py-2 text-[0.875rem] font-medium text-ink transition-colors hover:bg-canvas-deep"
              >
                Clear filters
              </Link>
            )}
          </div>
        </div>

        {results.items.length === 0 ? (
          /* An empty screen is an invitation to act, not an apology. */
          <div className="mt-8 rounded-card border border-dashed border-line bg-surface px-6 py-20 text-center">
            <p className="text-[1.0625rem] font-medium text-ink">
              {isFiltered ? 'Nothing matches those filters' : 'No homes are live yet'}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-muted">
              {isFiltered
                ? 'Try a wider budget or a different locality — verified inventory is still growing.'
                : 'Homes appear here once an officer has checked the ownership documents.'}
            </p>
            {isFiltered && (
              <Link
                href="/"
                className="mt-6 inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
              >
                Show everything
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
    </div>
  );
}
