/**
 * Indian formatting.
 *
 * Rupee amounts must use the lakh/crore grouping (₹95,00,000), not the Western
 * thousands grouping (₹9,500,000). Getting this wrong is immediately visible to
 * every Indian user and reads as a foreign product.
 */

const inrGrouped = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

/** Full amount with lakh/crore grouping: 9500000 → "₹95,00,000". */
export function formatRupees(amount: number): string {
  return `₹${inrGrouped.format(Math.round(amount))}`;
}

/**
 * Compact amount for cards, in the units Indians actually speak:
 * 9500000 → "₹95 L", 12500000 → "₹1.25 Cr".
 */
export function formatRupeesShort(amount: number): string {
  if (amount >= 10_000_000) {
    const crore = amount / 10_000_000;
    // Two decimals below 10 Cr, one above — "₹1.25 Cr" but "₹12.5 Cr".
    return `₹${crore.toFixed(crore < 10 ? 2 : 1).replace(/\.0+$/, '')} Cr`;
  }
  if (amount >= 100_000) {
    const lakh = amount / 100_000;
    return `₹${lakh.toFixed(lakh < 10 ? 2 : 0).replace(/\.0+$/, '')} L`;
  }
  return formatRupees(amount);
}

/** "₹5,758 / sq ft" */
export function formatPerSqft(value: number | null): string | null {
  if (value === null) {
    return null;
  }
  return `${formatRupees(value)} / sq ft`;
}

export function formatArea(sqft: number): string {
  return `${inrGrouped.format(sqft)} sq ft`;
}

/** "30 Jul 2026" — unambiguous, and the order Indians read dates in. */
export function formatDate(value: string | Date | null): string | null {
  if (!value) {
    return null;
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Relative age, used for "Listed 3 days ago" and "Owner confirmed 2 days ago".
 *
 * These two phrases are the honest counter to the incumbent practice of
 * re-posting stale listings so they appear new, so the wording stays plain and
 * the source is always the immutable first-listed date.
 */
export function formatAge(value: string | Date | null): string | null {
  if (!value) {
    return null;
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);

  if (days <= 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 30) {
    return `${days} days ago`;
  }
  const months = Math.floor(days / 30);
  if (months === 1) {
    return 'a month ago';
  }
  if (months < 12) {
    return `${months} months ago`;
  }
  const years = Math.floor(months / 12);
  return years === 1 ? 'a year ago' : `${years} years ago`;
}

/**
 * Full address line for the detail page.
 *
 * Indian addresses normally end with the locality — "Tower 2, My Home Apas,
 * Kokapet" — so appending the locality field unconditionally produced
 * "Kokapet, Kokapet". Only append when it is not already there.
 */
export function formatFullAddress(address: string, locality: string): string {
  const trimmed = address.trim().replace(/,\s*$/, '');
  const alreadyNamed = new RegExp(
    // Word-bounded so "Kondapur Main Road" still counts as naming Kondapur,
    // while a locality that is merely a substring of another word does not.
    `\\b${locality.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
    'i',
  ).test(trimmed);

  return alreadyNamed ? trimmed : `${trimmed}, ${locality}`;
}

/** "3 BHK" — the unit Indian buyers search in. */
export function formatConfig(bedrooms: number, propertyType: string): string {
  const type = propertyType.charAt(0) + propertyType.slice(1).toLowerCase();
  if (bedrooms <= 0) {
    return type;
  }
  return `${bedrooms} BHK ${type}`;
}

/**
 * How this listing's rate compares with its locality.
 *
 * Returns null when there is no meaningful median — a comparison drawn from two
 * properties would be read as authoritative and shouldn't be shown at all.
 */
export function formatBenchmark(
  differencePercent: number | null,
  medianPricePerSqft: number | null,
  locality: string,
): string | null {
  if (differencePercent === null || medianPricePerSqft === null) {
    return null;
  }
  const magnitude = Math.abs(differencePercent).toFixed(1).replace(/\.0$/, '');
  if (Math.abs(differencePercent) < 1) {
    return `In line with the ${locality} median of ${formatRupees(medianPricePerSqft)}`;
  }
  const direction = differencePercent > 0 ? 'above' : 'below';
  return `${magnitude}% ${direction} the ${locality} median of ${formatRupees(medianPricePerSqft)}`;
}
