import { formatArea } from '@/lib/format';
import { labelFor } from '@/lib/property-options';

/**
 * The standardised field set, rendered identically on every listing.
 *
 * The PRD's acceptance criterion is that every published listing displays the
 * full set — so unanswered fields are shown as "Not specified" rather than
 * dropped. Hiding them would make a thin listing look as complete as a
 * thorough one, which is the exact deception this section exists to prevent.
 *
 * Amenities are the one exception: an empty checklist is stated once rather
 * than as twenty absent rows.
 */

export interface PropertyFactsData {
  bedrooms: number;
  bathrooms: number;
  areaSqft: number;
  carpetAreaSqft: number | null;
  balconies: number | null;
  floor: number | null;
  totalFloors: number | null;
  yearBuilt: number | null;
  possession: string;
  furnishing: string | null;
  facing: string | null;
  coveredParking: number | null;
  openParking: number | null;
  ownership: string | null;
  approvingAuthority: string | null;
  amenities: string[];
}

const NOT_SPECIFIED = 'Not specified';

/** Ground floor is 0 and basements are negative, so this cannot test falsiness. */
function formatFloor(floor: number | null, totalFloors: number | null): string {
  if (floor === null) {
    return totalFloors === null ? NOT_SPECIFIED : `of ${totalFloors} floors`;
  }
  const name = floor === 0 ? 'Ground' : floor < 0 ? `Basement ${Math.abs(floor)}` : `${floor}`;
  return totalFloors === null ? name : `${name} of ${totalFloors}`;
}

function formatParking(covered: number | null, open: number | null): string {
  if (covered === null && open === null) {
    return NOT_SPECIFIED;
  }
  const parts: string[] = [];
  if (covered !== null && covered > 0) parts.push(`${covered} covered`);
  if (open !== null && open > 0) parts.push(`${open} open`);
  // Both recorded as zero is a real answer, and a useful one.
  return parts.length > 0 ? parts.join(', ') : 'None';
}

export function PropertyFacts({ property }: { property: PropertyFactsData }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Configuration', value: `${property.bedrooms} BHK` },
    { label: 'Bathrooms', value: String(property.bathrooms) },
    {
      label: 'Balconies',
      value: property.balconies === null ? NOT_SPECIFIED : String(property.balconies),
    },
    { label: 'Built-up area', value: formatArea(property.areaSqft) },
    {
      label: 'Carpet area',
      value:
        property.carpetAreaSqft === null ? NOT_SPECIFIED : formatArea(property.carpetAreaSqft),
    },
    { label: 'Floor', value: formatFloor(property.floor, property.totalFloors) },
    {
      label: 'Availability',
      value: labelFor('possession', property.possession) ?? NOT_SPECIFIED,
    },
    {
      label: 'Furnishing',
      value: labelFor('furnishing', property.furnishing) ?? NOT_SPECIFIED,
    },
    { label: 'Facing', value: labelFor('facing', property.facing) ?? NOT_SPECIFIED },
    {
      label: 'Parking',
      value: formatParking(property.coveredParking, property.openParking),
    },
    {
      label: 'Year built',
      value: property.yearBuilt === null ? NOT_SPECIFIED : String(property.yearBuilt),
    },
    { label: 'Ownership', value: labelFor('ownership', property.ownership) ?? NOT_SPECIFIED },
    {
      label: 'Approved by',
      value: labelFor('approvingAuthority', property.approvingAuthority) ?? NOT_SPECIFIED,
    },
  ];

  return (
    <section className="mt-10" aria-labelledby="facts">
      <h2 id="facts" className="display text-[1.25rem] text-ink">
        Property details
      </h2>
      <p className="mt-1.5 text-[0.875rem] text-muted">
        The same set of facts is recorded for every home here, so two listings
        can be compared directly.
      </p>

      <dl className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 bg-surface px-4 py-3">
            <dt className="text-[0.875rem] text-muted">{row.label}</dt>
            <dd
              className={`text-right text-[0.9375rem] font-medium tabular ${
                row.value === NOT_SPECIFIED ? 'text-faint' : 'text-ink'
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
        {/*
          The grid draws its rules with a `gap-px` over a `bg-line` background,
          so an odd row count leaves the final half-row showing that background
          as a grey block. This fills it on two columns and collapses on one.
        */}
        {rows.length % 2 === 1 && (
          <div aria-hidden="true" className="hidden bg-surface sm:block" />
        )}
      </dl>

      <div className="mt-6">
        <h3 className="text-[0.9375rem] font-semibold text-ink">Amenities</h3>
        {property.amenities.length === 0 ? (
          <p className="mt-2 text-[0.875rem] text-faint">
            The seller has not listed any amenities.
          </p>
        ) : (
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {property.amenities.map((amenity) => (
              <li
                key={amenity}
                className="rounded-control border border-line bg-surface px-3 py-1.5 text-[0.8125rem] text-ink"
              >
                {labelFor('amenity', amenity)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
