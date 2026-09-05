import {
  Amenity,
  ApprovingAuthority,
  FacingDirection,
  FurnishingStatus,
  ListingKind,
  OwnershipType,
  PossessionStatus,
  PropertyType,
  TenantPreference,
} from '@kamala/db';
import { z } from 'zod';

/**
 * Public search filters.
 *
 * Every bound is enforced server-side. `limit` is capped at 50 because listing
 * data is scraped aggressively by competitors — a caller must not be able to
 * request the whole inventory in one request.
 */
export const searchQuerySchema = z.object({
  /** Free text, matched against title and description. */
  q: z.string().trim().min(2).max(120).optional(),

  // --- Location ---
  city: z.string().trim().max(80).optional(),
  /**
   * One or more locality (neighborhood) ids.
   *
   * Buyers routinely want "Kondapur OR Gachibowli OR Kokapet" — restricting
   * the search to one locality forces them to run the same query three times
   * and reconcile the results by hand. Accepts either repeated
   * `neighborhoodId=` params or a single comma-separated value, mirroring
   * the amenities / propertyType pattern.
   */
  neighborhoodId: z
    .union([z.string(), z.array(z.string())])
    .transform((value) =>
      (Array.isArray(value) ? value : value.split(','))
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().uuid('Each locality id must be a valid uuid')).min(1).max(20))
    .optional(),
  pincode: z
    .string()
    .regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit pincode')
    .optional(),

  // --- Property ---
  /**
   * One or more property types, as repeated params or a comma-separated value.
   *
   * Multi-select because "flat or independent house" is an ordinary thing to
   * want, and forcing one at a time makes a buyer run the same search twice and
   * compare the results in their head.
   */
  propertyType: z
    .union([z.string(), z.array(z.string())])
    .transform((value) =>
      (Array.isArray(value) ? value : value.split(','))
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.nativeEnum(PropertyType)).min(1).max(Object.keys(PropertyType).length))
    .optional(),
  /**
   * Exact bedroom counts, one or several: `bedrooms=2,3` means a 2 or 3 BHK.
   *
   * Kept alongside `minBedrooms` rather than replacing it — "3 and above" and
   * "exactly 2 or 3" are different questions, and a buyer with a hard ceiling on
   * size is badly served by an open-ended filter.
   */
  bedrooms: z
    .union([z.string(), z.array(z.string()), z.number()])
    .transform((value) => {
      const items =
        typeof value === 'number'
          ? [String(value)]
          : Array.isArray(value)
            ? value
            : value.split(',');
      return items.map((item) => String(item).trim()).filter(Boolean);
    })
    .pipe(z.array(z.coerce.number().int().min(0).max(20)).min(1).max(21))
    .optional(),
  minBedrooms: z.coerce.number().int().min(0).max(20).optional(),

  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  minAreaSqft: z.coerce.number().int().min(0).optional(),
  maxAreaSqft: z.coerce.number().int().min(0).optional(),

  // --- Distance ("homes near me") ---
  /**
   * Buyer's current point of interest. When both nearLat and nearLng are
   * present the search returns only listings within `radiusKm` of that point
   * (Haversine, computed in SQL). Listings without a lat/lng are excluded
   * from a near-me query — "within 5 km" cannot honestly include a home
   * whose coordinates nobody recorded.
   */
  nearLat: z.coerce.number().min(-90).max(90).optional(),
  nearLng: z.coerce.number().min(-180).max(180).optional(),
  /**
   * Radius in kilometres. Default 5 km covers "walking + short drive" for
   * an urban buyer without pulling half the city. Cap of 50 km is one
   * conservative Hyderabad diameter — anything larger is a whole-city query
   * that should not pretend to be "nearby".
   */
  radiusKm: z.coerce.number().min(0.1).max(50).default(5).optional(),

  // --- Rent parity ---
  /**
   * SALE (default) or RENT. Determines whether monthlyRent/deposit
   * filters apply, and whether the response should render rent or sale
   * pricing. Absent = defaults to SALE at the service layer.
   */
  kind: z.nativeEnum(ListingKind).optional(),
  /** Monthly rent range in ₹. Only meaningful when kind = RENT. */
  minRent: z.coerce.number().int().min(0).optional(),
  maxRent: z.coerce.number().int().min(0).optional(),
  /** Cap on security deposit in months of rent — 1, 2, or 3 typical. */
  maxDepositMonths: z.coerce.number().int().min(0).max(24).optional(),
  tenantPreference: z.nativeEnum(TenantPreference).optional(),
  petsAllowed: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  /**
   * Marketing filter — owner-listed, no brokerage. Ranks alongside the
   * ownersOnly filter but semantically distinct: the owner can be a
   * broker who still lists at zero brokerage as a promotion.
   */
  zeroBrokerage: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  /** ISO date — listings available on or after this date. */
  availableFrom: z.coerce.date().optional(),

  /**
   * Owner-direct filter.
   *
   * Buyers repeatedly complain that "owner-direct" platforms are broker-dominated
   * in practice. Making this an explicit, honest filter is cheap and directly
   * addresses that.
   */
  ownersOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),

  // --- Structured filters (PRD feature 10) ---
  possession: z.nativeEnum(PossessionStatus).optional(),
  furnishing: z.nativeEnum(FurnishingStatus).optional(),
  facing: z.nativeEnum(FacingDirection).optional(),
  ownership: z.nativeEnum(OwnershipType).optional(),
  approvingAuthority: z.nativeEnum(ApprovingAuthority).optional(),

  /**
   * Amenities, combined with AND — a buyer asking for a lift and a lift only.
   *
   * Accepts either repeated `amenities=` params or one comma-separated value,
   * because a filter UI built from checkboxes produces the first and a shareable
   * URL is far more readable as the second.
   */
  amenities: z
    .union([z.string(), z.array(z.string())])
    .transform((value) =>
      (Array.isArray(value) ? value : value.split(','))
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.nativeEnum(Amenity)).max(Object.keys(Amenity).length))
    .optional(),

  /** Ground floor is 0 and basements are negative, so the floor of the range is not 0. */
  minFloor: z.coerce.number().int().min(-5).max(200).optional(),
  maxFloor: z.coerce.number().int().min(-5).max(200).optional(),

  /**
   * Age in years, matched against `yearBuilt`.
   *
   * Stored as a construction year rather than an age, because an age column
   * would be wrong the moment the year turned. The conversion happens at query
   * time instead.
   */
  maxAgeYears: z.coerce.number().int().min(0).max(100).optional(),

  sort: z
    .enum([
      'newest',
      'priceAsc',
      'priceDesc',
      'rentAsc',
      'rentDesc',
      'areaDesc',
      'relevance',
      // Closest-first — only meaningful when nearLat/nearLng are set, enforced
      // in a .refine below. Kept in the enum rather than gated implicitly so
      // an invalid combination fails at DTO validation, not silently at SQL.
      'distanceAsc',
    ])
    .default('newest'),

  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
})
  .refine(
    (v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice,
    { message: 'minPrice cannot exceed maxPrice', path: ['minPrice'] },
  )
  .refine(
    (v) =>
      v.minAreaSqft === undefined ||
      v.maxAreaSqft === undefined ||
      v.minAreaSqft <= v.maxAreaSqft,
    { message: 'minAreaSqft cannot exceed maxAreaSqft', path: ['minAreaSqft'] },
  )
  .refine((v) => v.sort !== 'relevance' || v.q !== undefined, {
    message: 'Relevance sorting requires a search term',
    path: ['sort'],
  })
  .refine(
    (v) => v.minFloor === undefined || v.maxFloor === undefined || v.minFloor <= v.maxFloor,
    { message: 'minFloor cannot exceed maxFloor', path: ['minFloor'] },
  )
  .refine(
    (v) => v.minRent === undefined || v.maxRent === undefined || v.minRent <= v.maxRent,
    { message: 'minRent cannot exceed maxRent', path: ['minRent'] },
  )
  // Distance filter is only meaningful with both coordinates — one axis alone
  // cannot describe a point on a map, and defaulting the missing axis would
  // silently return listings anchored somewhere the buyer never asked about.
  .refine(
    (v) => (v.nearLat === undefined) === (v.nearLng === undefined),
    { message: 'nearLat and nearLng must be provided together', path: ['nearLat'] },
  )
  // distanceAsc sort presupposes there is a distance to sort by. Without the
  // coordinates the sort has no ORDER BY expression to build, so refuse the
  // combination up front.
  .refine((v) => v.sort !== 'distanceAsc' || v.nearLat !== undefined, {
    message: 'distanceAsc sorting requires nearLat and nearLng',
    path: ['sort'],
  });

export type SearchQueryDto = z.infer<typeof searchQuerySchema>;

/** The PRD caps comparison at four; more columns stop being readable anyway. */
export const MAX_COMPARE = 4;

/**
 * Comparison request.
 *
 * Ids arrive as one comma-separated value so the compare view has a shareable,
 * server-rendderable URL rather than living only in browser storage.
 */
export const compareQuerySchema = z.object({
  ids: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string().uuid('Each id must be a listing id'))
        .min(2, 'Choose at least two homes to compare')
        .max(MAX_COMPARE, `You can compare up to ${MAX_COMPARE} homes at once`),
    )
    // A repeated id would render the same home twice and skew the comparison.
    .refine((ids) => new Set(ids).size === ids.length, 'Each home can appear only once'),
});

export type CompareQueryDto = z.infer<typeof compareQuerySchema>;

/** Minimum approved listings in a locality before a median is meaningful. */
export const MIN_MEDIAN_SAMPLE = 5;

/** How long a cached locality median stays fresh. */
export const MEDIAN_TTL_MS = 24 * 60 * 60 * 1000;
