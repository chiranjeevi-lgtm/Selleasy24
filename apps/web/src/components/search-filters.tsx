import Link from 'next/link';
import {
  AMENITY_OPTIONS,
  APPROVING_AUTHORITY_OPTIONS,
  FACING_OPTIONS,
  FURNISHING_OPTIONS,
  OWNERSHIP_OPTIONS,
  POSSESSION_OPTIONS,
  labelFor,
} from '@/lib/property-options';

/**
 * Structured filters.
 *
 * Deliberately a plain GET form with no client JavaScript. Filter state lives
 * in the URL, which means it survives a reload, works with the back button, is
 * shareable, and is indexable — the PRD's "persists during the session" comes
 * free rather than needing a store.
 *
 * The panel is a native `<details>`, so it opens and closes without JS and
 * starts open whenever a filter inside it is active — a collapsed panel hiding
 * applied filters is how people end up convinced the site has no inventory.
 */

export type FilterValues = Record<string, string | undefined>;

/** Filters that live inside the collapsible panel. */
const PANEL_KEYS = [
  'possession',
  'furnishing',
  'facing',
  'approvingAuthority',
  'ownership',
  'amenities',
  'minFloor',
  'maxFloor',
  'maxAgeYears',
] as const;

const selectClass =
  'mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2 text-[0.875rem] text-ink outline-none transition-colors focus:border-action focus:ring-2 focus:ring-action/15';

const labelClass = 'block text-[0.75rem] font-medium text-muted';

function Field({
  name,
  label,
  value,
  options,
  anyLabel,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: readonly { value: string; label: string }[];
  anyLabel: string;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <select name={name} defaultValue={value ?? ''} className={selectClass}>
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterPanel({ values }: { values: FilterValues }) {
  const selectedAmenities = (values.amenities ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const anyPanelFilterActive = PANEL_KEYS.some((key) => Boolean(values[key]));

  return (
    <details open={anyPanelFilterActive} className="group mt-3">
      <summary className="inline-flex cursor-pointer select-none items-center gap-2 rounded-control border border-line bg-surface px-3.5 py-2 text-[0.875rem] font-medium text-ink transition-colors hover:border-muted">
        <span>More filters</span>
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className="h-2.5 w-2.5 transition-transform group-open:rotate-180"
        >
          <path d="M1.5 4 6 8.5 10.5 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>

      <div className="mt-3 rounded-card border border-line bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            name="possession"
            label="Availability"
            value={values.possession}
            options={POSSESSION_OPTIONS}
            anyLabel="Any"
          />
          <Field
            name="furnishing"
            label="Furnishing"
            value={values.furnishing}
            options={FURNISHING_OPTIONS}
            anyLabel="Any"
          />
          <Field
            name="facing"
            label="Facing"
            value={values.facing}
            options={FACING_OPTIONS}
            anyLabel="Any"
          />
          <Field
            name="approvingAuthority"
            label="Approved by"
            value={values.approvingAuthority}
            options={APPROVING_AUTHORITY_OPTIONS}
            anyLabel="Any authority"
          />
          <Field
            name="ownership"
            label="Ownership"
            value={values.ownership}
            options={OWNERSHIP_OPTIONS}
            anyLabel="Any"
          />
          <label className="block">
            <span className={labelClass}>Age of property</span>
            <select name="maxAgeYears" defaultValue={values.maxAgeYears ?? ''} className={selectClass}>
              <option value="">Any age</option>
              <option value="1">Up to 1 year</option>
              <option value="3">Up to 3 years</option>
              <option value="5">Up to 5 years</option>
              <option value="10">Up to 10 years</option>
              <option value="20">Up to 20 years</option>
            </select>
          </label>

          <label className="block">
            <span className={labelClass}>Floor from</span>
            <input
              type="number"
              name="minFloor"
              min={-5}
              max={200}
              defaultValue={values.minFloor ?? ''}
              placeholder="Any"
              className={selectClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Floor up to</span>
            <input
              type="number"
              name="maxFloor"
              min={-5}
              max={200}
              defaultValue={values.maxFloor ?? ''}
              placeholder="Any"
              className={selectClass}
            />
          </label>
        </div>

        <fieldset className="mt-5 border-t border-line pt-4">
          <legend className={labelClass}>Amenities</legend>
          <p className="mt-1 text-[0.75rem] text-faint">
            Homes must have all the amenities you tick.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {AMENITY_OPTIONS.map((option) => (
              <div key={option.value}>
                {/*
                  Repeated `amenities` params; the API accepts either that or a
                  comma-separated string and normalises both.
                */}
                <input
                  type="checkbox"
                  id={`filter-${option.value}`}
                  name="amenities"
                  value={option.value}
                  defaultChecked={selectedAmenities.includes(option.value)}
                  className="peer sr-only"
                />
                <label
                  htmlFor={`filter-${option.value}`}
                  className="inline-block cursor-pointer select-none rounded-control border border-line px-3 py-1.5 text-[0.8125rem] text-muted transition-colors hover:border-muted hover:text-ink peer-checked:border-action peer-checked:bg-action peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-action"
                >
                  {option.label}
                </label>
              </div>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
          <button
            type="submit"
            className="rounded-control bg-action px-5 py-2.5 text-[0.875rem] font-semibold text-white transition-colors hover:bg-action-hover"
          >
            Apply filters
          </button>
          <Link
            href="/"
            className="text-[0.875rem] text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Clear all
          </Link>
        </div>
      </div>
    </details>
  );
}

/**
 * Applied filters, each removable on its own.
 *
 * Every chip is a link back to the same search minus that one filter, so a
 * buyer who over-narrowed can widen by one step instead of clearing everything
 * and starting again.
 */
export function AppliedFilters({
  values,
  localityNames,
}: {
  values: FilterValues;
  /**
   * Map of neighborhoodId → display name for every selected locality.
   * Multi-locality searches show one removable chip per locality so a buyer
   * can drop one without losing the rest.
   */
  localityNames?: Record<string, string>;
}) {
  const chips: Array<{ key: string; label: string; dropValue?: string }> = [];

  const add = (key: string, label: string | null, dropValue?: string) => {
    if (label) {
      chips.push({ key, label, ...(dropValue !== undefined && { dropValue }) });
    }
  };

  // One chip per selected locality — dropping "Kondapur" from a
  // "Kondapur + Gachibowli" search leaves Gachibowli intact, whereas a
  // single "3 localities" chip would force clearing all three at once.
  for (const id of (values.neighborhoodId ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const name = localityNames?.[id];
    if (name) add('neighborhoodId', name, id);
  }

  const PROPERTY_TYPE_LABELS: Record<string, string> = {
    FLAT: 'Flat',
    APARTMENT: 'Apartment',
    HOUSE: 'Independent house',
    BUILDING: 'Building',
  };

  // Multi-value filters get one chip per value, each removable on its own —
  // narrowing from "2 or 3 BHK" to just "3 BHK" should not mean starting over.
  for (const type of (values.propertyType ?? '').split(',').map((t) => t.trim()).filter(Boolean)) {
    add('propertyType', PROPERTY_TYPE_LABELS[type] ?? type, type);
  }
  for (const bhk of (values.bedrooms ?? '').split(',').map((b) => b.trim()).filter(Boolean)) {
    add('bedrooms', `${bhk} BHK`, bhk);
  }

  if (values.minBedrooms) add('minBedrooms', `${values.minBedrooms}+ BHK`);

  /** "₹25 L" / "₹1.5 Cr" — the units Indians actually speak. */
  const money = (raw: string): string => {
    const amount = Number(raw);
    if (!Number.isFinite(amount)) return raw;
    return amount >= 10_000_000
      ? `₹${Number((amount / 10_000_000).toFixed(2))} Cr`
      : `₹${Number((amount / 100_000).toFixed(2))} L`;
  };

  if (values.minPrice) add('minPrice', `Over ${money(values.minPrice)}`);
  if (values.maxPrice) add('maxPrice', `Under ${money(values.maxPrice)}`);
  if (values.ownersOnly === 'true') add('ownersOnly', 'Owners only');
  add('possession', labelFor('possession', values.possession));
  add('furnishing', labelFor('furnishing', values.furnishing));
  add('facing', labelFor('facing', values.facing));
  add('approvingAuthority', labelFor('approvingAuthority', values.approvingAuthority));
  add('ownership', labelFor('ownership', values.ownership));
  if (values.maxAgeYears) add('maxAgeYears', `Up to ${values.maxAgeYears} years old`);
  if (values.minFloor) add('minFloor', `Floor ${values.minFloor}+`);
  if (values.maxFloor) add('maxFloor', `Floor up to ${values.maxFloor}`);

  // Each amenity drops individually rather than clearing the whole set.
  for (const amenity of (values.amenities ?? '').split(',').map((a) => a.trim()).filter(Boolean)) {
    add('amenities', labelFor('amenity', amenity), amenity);
  }

  // "Near me" — the three near-* params travel as one filter from the user's
  // point of view, so a single chip represents them and clearing removes all
  // three together. Handled below in hrefWithout via `dropValue = '__near__'`.
  if (values.nearLat && values.nearLng) {
    const radius = values.radiusKm ?? '5';
    add('__near__', `Within ${radius} km of you`);
  }

  if (chips.length === 0) {
    return null;
  }

  /** Rebuilds the URL without one filter — or without one amenity. */
  function hrefWithout(key: string, dropValue?: string): string {
    // Sentinel key: "Near me" is one logical chip that hides three URL params
    // (nearLat, nearLng, radiusKm). Dropping the chip drops all three so the
    // buyer isn't left with an orphan radius applied against no coordinates.
    const isNear = key === '__near__';

    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(values)) {
      if (!value) continue;
      if (isNear && (name === 'nearLat' || name === 'nearLng' || name === 'radiusKm')) {
        continue;
      }
      if (name === key && dropValue === undefined) continue;
      if (name === key && dropValue !== undefined) {
        const remaining = value
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item && item !== dropValue);
        if (remaining.length > 0) params.set(name, remaining.join(','));
        continue;
      }
      params.set(name, value);
    }
    const query = params.toString();
    return query ? `/?${query}` : '/';
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Link
          key={`${chip.key}:${chip.dropValue ?? chip.label}`}
          href={hrefWithout(chip.key, chip.dropValue)}
          className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[0.8125rem] text-ink transition-colors hover:border-muted"
        >
          {chip.label}
          <span aria-hidden="true" className="text-faint transition-colors group-hover:text-ink">
            ×
          </span>
          <span className="sr-only">Remove this filter</span>
        </Link>
      ))}

      <Link
        href="/"
        className="ml-1 text-[0.8125rem] text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
      >
        Clear all
      </Link>
    </div>
  );
}
