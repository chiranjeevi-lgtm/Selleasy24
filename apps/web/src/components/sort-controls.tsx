import Link from 'next/link';

/**
 * Sort controls for the search results grid.
 *
 * Rendered as a row of link-based chips rather than a select: the site
 * already routes every filter change through the URL, so a click that
 * navigates to `?sort=priceAsc` fits the existing pattern (shareable,
 * back-button-safe, works without JS) instead of introducing a client-side
 * dropdown for one control.
 *
 * The chip labels are short deliberately — a full-width row of "Price:
 * lowest first" reads as marketing copy where "Price ↑" reads as an
 * instrument. Sort is a tool, not a value proposition.
 */

// Sort values are the backend's — the search DTO validates against this
// exact enum (see apps/api/src/modules/search/search.dto.ts). Adding a value
// here without adding it there returns a "Validation failed" from the API.
export const SALE_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'priceAsc', label: 'Price ↑' },
  { value: 'priceDesc', label: 'Price ↓' },
  { value: 'areaDesc', label: 'Area ↓' },
] as const;

// Rent screens show rent-based sorting instead of sale price. Same axis, a
// different column on the backend — the enum values map straight to Prisma
// orderBy in buildOrderBy().
export const RENT_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'rentAsc', label: 'Rent ↑' },
  { value: 'rentDesc', label: 'Rent ↓' },
  { value: 'areaDesc', label: 'Area ↓' },
] as const;

export type SortOption = { value: string; label: string };

const DEFAULT_SORT = 'newest';

export function SortControls({
  values,
  action = '/',
  options = SALE_SORT_OPTIONS as readonly SortOption[],
}: {
  values: Record<string, string | undefined>;
  /** Path the sort links should point back to — '/' for sale, '/rent' for rent. */
  action?: string;
  /** Which sort option set to render. Sale and rent expose different axes. */
  options?: readonly SortOption[];
}) {
  const current = values.sort ?? DEFAULT_SORT;

  /**
   * Rebuild the URL with the requested sort, preserving every other filter.
   * The default sort is left off the URL so a shared "?sort=newest" link
   * doesn't survive as visible noise on someone else's screen.
   */
  function href(sort: string): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (!value || key === 'sort') continue;
      params.set(key, value);
    }
    if (sort !== DEFAULT_SORT) params.set('sort', sort);
    const qs = params.toString();
    return qs ? `${action}?${qs}` : action;
  }

  return (
    <div
      role="group"
      aria-label="Sort results"
      className="flex flex-wrap items-center gap-1.5"
    >
      <span className="mr-1 text-[0.75rem] font-medium text-muted">Sort</span>
      {options.map((option) => {
        const active = current === option.value;
        return (
          <Link
            key={option.value}
            href={href(option.value)}
            aria-current={active ? 'true' : undefined}
            className={
              active
                ? 'rounded-full bg-action px-3 py-1.5 text-[0.8125rem] font-medium text-white'
                : 'rounded-full border border-line bg-surface px-3 py-1.5 text-[0.8125rem] text-ink transition-colors hover:border-muted'
            }
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
