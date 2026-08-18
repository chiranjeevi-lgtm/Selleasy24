import {
  Amenity,
  ApprovingAuthority,
  FacingDirection,
  FurnishingStatus,
  OwnershipType,
  PossessionStatus,
  PropertyType,
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
  neighborhoodId: z.string().uuid().optional(),
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
    .enum(['newest', 'priceAsc', 'priceDesc', 'areaDesc', 'relevance'])
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
  );

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
