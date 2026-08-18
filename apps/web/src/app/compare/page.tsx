import type { Metadata } from 'next';
import Link from 'next/link';
import { api, type CompareResult } from '@/lib/api';
import { RemoveFromCompare } from '@/components/compare-controls';
import {
  formatArea,
  formatPerSqft,
  formatRupees,
  formatRupeesShort,
  formatAge,
} from '@/lib/format';
import { labelFor } from '@/lib/property-options';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Compare homes',
  description: 'Compare verified homes side by side on the same set of facts.',
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function photoUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type CompareItem = CompareResult['items'][number];

const NOT_SPECIFIED = '—';

/** Ground is 0 and basements are negative, so this cannot test falsiness. */
function floorLabel(floor: number | null, totalFloors: number | null): string {
  if (floor === null) {
    return NOT_SPECIFIED;
  }
  const name = floor === 0 ? 'Ground' : floor < 0 ? `Basement ${Math.abs(floor)}` : String(floor);
  return totalFloors === null ? name : `${name} of ${totalFloors}`;
}

function parkingLabel(covered: number | null, open: number | null): string {
  if (covered === null && open === null) {
    return NOT_SPECIFIED;
  }
  const parts: string[] = [];
  if (covered) parts.push(`${covered} covered`);
  if (open) parts.push(`${open} open`);
  return parts.length > 0 ? parts.join(', ') : 'None';
}

/**
 * The comparison rows.
 *
 * Read straight off the same structured schema the detail page uses, which is
 * what makes the columns align field-for-field — the PRD's whole reason for
 * standardising the data in the first place.
 */
const ROWS: Array<{ label: string; get: (item: CompareItem) => string }> = [
  { label: 'Price', get: (i) => formatRupees(i.price) },
  { label: 'Price per sq ft', get: (i) => formatPerSqft(i.pricePerSqft) ?? NOT_SPECIFIED },
  { label: 'Locality', get: (i) => i.property.locality },
  { label: 'Configuration', get: (i) => `${i.property.bedrooms} BHK` },
  { label: 'Bathrooms', get: (i) => String(i.property.bathrooms) },
  {
    label: 'Balconies',
    get: (i) => (i.property.balconies === null ? NOT_SPECIFIED : String(i.property.balconies)),
  },
  { label: 'Built-up area', get: (i) => formatArea(i.property.areaSqft) },
  {
    label: 'Carpet area',
    get: (i) =>
      i.property.carpetAreaSqft === null
        ? NOT_SPECIFIED
        : formatArea(i.property.carpetAreaSqft),
  },
  { label: 'Floor', get: (i) => floorLabel(i.property.floor, i.property.totalFloors) },
  {
    label: 'Availability',
    get: (i) => labelFor('possession', i.property.possession) ?? NOT_SPECIFIED,
  },
  {
    label: 'Furnishing',
    get: (i) => labelFor('furnishing', i.property.furnishing) ?? NOT_SPECIFIED,
  },
  { label: 'Facing', get: (i) => labelFor('facing', i.property.facing) ?? NOT_SPECIFIED },
  {
    label: 'Parking',
    get: (i) => parkingLabel(i.property.coveredParking, i.property.openParking),
  },
  {
    label: 'Year built',
    get: (i) => (i.property.yearBuilt === null ? NOT_SPECIFIED : String(i.property.yearBuilt)),
  },
  {
    label: 'Ownership',
    get: (i) => labelFor('ownership', i.property.ownership) ?? NOT_SPECIFIED,
  },
  {
    label: 'Approved by',
    get: (i) => labelFor('approvingAuthority', i.property.approvingAuthority) ?? NOT_SPECIFIED,
  },
  { label: 'Listed by', get: (i) => (i.listedBy.kind === 'OWNER' ? 'Owner' : 'Agent') },
  { label: 'First listed', get: (i) => formatAge(i.firstListedAt) ?? NOT_SPECIFIED },
];

export default async function ComparePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = Array.isArray(params.ids) ? params.ids.join(',') : (params.ids ?? '');
  const ids = raw.split(',').map((id) => id.trim()).filter(Boolean);

  let result: CompareResult = { items: [], unavailable: [] };
  if (ids.length >= 2) {
    result = await api
      .compareListings(ids)
      .catch((): CompareResult => ({ items: [], unavailable: [] }));
  }

  const items = result.items;

  if (items.length < 2) {
    return (
      <div className="mx-auto max-w-[76rem] px-5 py-16 sm:px-8">
        <h1 className="display text-[1.75rem] text-ink">Nothing to compare yet</h1>
        <p className="mt-2.5 max-w-prose text-[0.9375rem] leading-relaxed text-muted">
          Pick at least two homes using the Compare box on any listing, then come
          back here to see them side by side on the same set of facts.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-control bg-action px-5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-action-hover"
        >
          Browse homes
        </Link>
      </div>
    );
  }

  const visibleIds = items.map((item) => item.id);

  return (
    <div className="mx-auto max-w-[76rem] px-5 py-8 sm:px-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-[0.875rem]">
        <Link href="/" className="text-muted transition-colors hover:text-ink">
          Homes
        </Link>
        <span className="mx-2 text-faint" aria-hidden="true">/</span>
        <span className="text-ink">Compare</span>
      </nav>

      <h1 className="display text-[1.75rem] text-ink sm:text-[2.125rem]">
        Comparing {items.length} homes
      </h1>
      <p className="mt-2 max-w-prose text-[0.9375rem] text-muted">
        Every home here has been checked against its ownership documents, and
        every row below comes from the same recorded fields.
      </p>

      {result.unavailable.length > 0 && (
        <p
          role="status"
          className="mt-4 rounded-card border-l-2 border-seal bg-seal-soft px-4 py-3 text-[0.875rem] text-ink"
        >
          {result.unavailable.length === 1 ? 'One home has' : `${result.unavailable.length} homes have`}{' '}
          been removed from your comparison because they are no longer listed.
        </p>
      )}

      {/*
        Horizontal scroll lives on this wrapper, not the page. A wide table that
        widens the document makes every other section scroll sideways too.
      */}
      <div className="mt-7 overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-left">
          <caption className="sr-only">
            Side-by-side comparison of {items.length} homes
          </caption>
          <thead>
            <tr>
              {/* Empty corner above the row labels. */}
              <th scope="col" className="w-[11rem] align-bottom">
                <span className="sr-only">Attribute</span>
              </th>
              {items.map((item) => (
                <th key={item.id} scope="col" className="w-1/4 min-w-[13rem] px-3 pb-4 align-bottom">
                  <Link href={`/listings/${item.id}`} className="group block">
                    <span className="block aspect-[4/3] overflow-hidden rounded-card bg-canvas-deep">
                      {item.photos[0] ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={photoUrl(item.photos[0].url)}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      ) : null}
                    </span>
                    <span className="mt-2.5 block display text-[1.125rem] leading-none text-ink tabular">
                      {formatRupeesShort(item.price)}
                    </span>
                    <span className="mt-1.5 block text-[0.875rem] font-medium leading-snug text-ink">
                      {item.property.bedrooms} BHK in {item.property.locality}
                    </span>
                  </Link>
                  <span className="mt-1.5 block">
                    <RemoveFromCompare listingId={item.id} ids={visibleIds} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {ROWS.map((row) => {
              const cells = items.map((item) => row.get(item));
              // When every home answers the same, the row carries no decision
              // value — dimmed so the differences are what the eye lands on.
              const allSame = cells.every((cell) => cell === cells[0]);

              return (
                <tr key={row.label} className="border-t border-line">
                  <th
                    scope="row"
                    className="py-3 pr-4 align-top text-[0.8125rem] font-medium text-muted"
                  >
                    {row.label}
                  </th>
                  {cells.map((cell, index) => (
                    <td
                      key={items[index]!.id}
                      className={`px-3 py-3 align-top text-[0.9375rem] tabular ${
                        cell === NOT_SPECIFIED
                          ? 'text-faint'
                          : allSame
                            ? 'text-muted'
                            : 'font-medium text-ink'
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}

            {/* Amenities are a set, not a value, so they get their own row shape. */}
            <tr className="border-t border-line">
              <th scope="row" className="py-3 pr-4 align-top text-[0.8125rem] font-medium text-muted">
                Amenities
              </th>
              {items.map((item) => (
                <td key={item.id} className="px-3 py-3 align-top">
                  {item.property.amenities.length === 0 ? (
                    <span className="text-[0.9375rem] text-faint">{NOT_SPECIFIED}</span>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {item.property.amenities.map((amenity) => (
                        <li
                          key={amenity}
                          className="rounded-control border border-line px-2 py-1 text-[0.75rem] text-ink"
                        >
                          {labelFor('amenity', amenity)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              ))}
            </tr>

            <tr className="border-t border-line">
              <th scope="row" className="py-4 pr-4 align-top">
                <span className="sr-only">Open listing</span>
              </th>
              {items.map((item) => (
                <td key={item.id} className="px-3 py-4 align-top">
                  <Link
                    href={`/listings/${item.id}`}
                    className="inline-block rounded-control border border-line px-4 py-2 text-[0.875rem] font-medium text-ink transition-colors hover:bg-canvas-deep"
                  >
                    View home
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
