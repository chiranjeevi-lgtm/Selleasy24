import {
  Amenity,
  ApprovingAuthority,
  ContactPreference,
  DocumentKind,
  FacingDirection,
  FurnishingStatus,
  IdProofKind,
  OwnershipType,
  PossessionStatus,
  PropertyType,
} from '@kamala/db';
import { z } from 'zod';

import { MAX_PHOTOS } from '../../common/storage/file-validation';

/** Rupee amounts are whole numbers; paise are meaningless at property prices. */
const priceSchema = z
  .number()
  .int('Price must be a whole number of rupees')
  .min(100_000, 'Price must be at least ₹1,00,000')
  .max(10_000_000_000, 'Price exceeds the supported maximum');

const pincodeSchema = z
  .string()
  .regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit Indian pincode');

/**
 * The listing field set.
 *
 * Kept as a plain object schema so both create and update can derive from it —
 * `.partial()` does not exist on the refined schema, so the cross-field checks
 * are applied separately to each below.
 */
const listingFields = z.object({
  // --- Listing ---
  title: z.string().trim().min(10, 'Title must be at least 10 characters').max(255),
  description: z
    .string()
    .trim()
    // PRD requires a minimum of 50 characters — thin descriptions are a
    // hallmark of the low-quality listings this platform exists to displace.
    .min(50, 'Description must be at least 50 characters')
    .max(5000),
  price: priceSchema,
  priceNegotiable: z.boolean().default(false),
  contactPreference: z.nativeEnum(ContactPreference).default(ContactPreference.ANY),

  // --- Property: location ---
  address: z.string().trim().min(10, 'Enter the full address').max(500),
  pincode: pincodeSchema,
  neighborhoodId: z.string().uuid('Select a locality from the list'),

  // --- Property: core ---
  propertyType: z.nativeEnum(PropertyType),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().int().min(0).max(20),
  areaSqft: z.number().int().min(50, 'Area looks too small').max(100_000),
  possession: z.nativeEnum(PossessionStatus),

  // --- Property: optional detail ---
  carpetAreaSqft: z.number().int().min(30).max(100_000).optional(),
  balconies: z.number().int().min(0).max(10).optional(),
  /// Ground is 0 and basements are negative, so this cannot be `.min(0)`.
  floor: z.number().int().min(-5).max(200).optional(),
  totalFloors: z.number().int().min(1).max(200).optional(),
  furnishing: z.nativeEnum(FurnishingStatus).optional(),
  facing: z.nativeEnum(FacingDirection).optional(),
  coveredParking: z.number().int().min(0).max(20).optional(),
  openParking: z.number().int().min(0).max(20).optional(),
  ownership: z.nativeEnum(OwnershipType).optional(),
  approvingAuthority: z.nativeEnum(ApprovingAuthority).optional(),
  amenities: z
    .array(z.nativeEnum(Amenity))
    // `.max()` must come before `.refine()`: refine returns a ZodEffects, which
    // has no array methods, and chaining onto it degrades the inferred type of
    // every field in this object to `unknown`.
    .max(Object.keys(Amenity).length)
    // Duplicates would inflate the count shown to buyers and break `hasEvery`
    // filtering in confusing ways.
    .refine((list) => new Set(list).size === list.length, 'Amenities must be unique')
    .default([]),

  yearBuilt: z
    .number()
    .int()
    .min(1900)
    // Generous upper bound for under-construction property.
    .max(new Date().getUTCFullYear() + 5)
    .optional(),
});

/**
 * Cross-field rules.
 *
 * These mirror the CHECK constraints in the database. The database is the
 * backstop that no code path can bypass; these exist so the seller gets a
 * readable message against the right field instead of a constraint violation.
 *
 * Written against a partial shape so update and create share one implementation
 * — on an update the absent fields are simply not checked.
 */
type ListingShape = Partial<z.infer<typeof listingFields>>;

function checkCrossFieldRules(value: ListingShape, ctx: z.RefinementCtx): void {
  if (
    value.floor !== undefined &&
    value.totalFloors !== undefined &&
    value.floor > value.totalFloors
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['floor'],
      message: 'Floor cannot be higher than the total number of floors',
    });
  }

  if (
    value.carpetAreaSqft !== undefined &&
    value.areaSqft !== undefined &&
    value.carpetAreaSqft >= value.areaSqft
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['carpetAreaSqft'],
      message: 'Carpet area must be smaller than built-up area',
    });
  }

  // A property cannot be ready to move into if it is not finished yet.
  if (
    value.possession === PossessionStatus.READY_TO_MOVE &&
    value.yearBuilt !== undefined &&
    value.yearBuilt > new Date().getUTCFullYear()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['yearBuilt'],
      message: 'A ready-to-move property cannot have a completion year in the future',
    });
  }
}

/*
 * The callbacks are inline arrows rather than a direct reference to
 * `checkCrossFieldRules`. Handing `superRefine` a function whose parameter is
 * typed `Partial<...>` stops Zod inferring the schema's output type, and every
 * field on the inferred DTO silently degrades to `{}` — which then surfaces far
 * away as "unknown is not assignable" inside the Prisma calls.
 */
export const createListingSchema = listingFields.superRefine((value, ctx) =>
  checkCrossFieldRules(value, ctx),
);

export type CreateListingDto = z.infer<typeof createListingSchema>;

/**
 * Updates.
 *
 * Every field optional, but the service rejects edits unless the listing is in
 * DRAFT, REJECTED or REVISION-requested state. An APPROVED listing cannot be
 * silently altered after verification — that would let a seller get a modest
 * property approved and then swap in different details behind the badge.
 */
export const updateListingSchema = listingFields
  .partial()
  .superRefine((value, ctx) => checkCrossFieldRules(value, ctx));

export type UpdateListingDto = z.infer<typeof updateListingSchema>;

/**
 * Property columns a seller controls, named once.
 *
 * Create and update both copy these across, and enumerating them per call site
 * is how the two quietly drift apart — a field added to create but forgotten in
 * update looks like "edits silently do nothing" and is painful to track down.
 *
 * `neighborhoodId` is deliberately absent: it needs an existence check before
 * it can be written, so it is handled explicitly by the service.
 */
export const SELLER_PROPERTY_FIELDS = [
  'address',
  'pincode',
  'propertyType',
  'bedrooms',
  'bathrooms',
  'areaSqft',
  'carpetAreaSqft',
  'balconies',
  'yearBuilt',
  'floor',
  'totalFloors',
  'possession',
  'furnishing',
  'facing',
  'coveredParking',
  'openParking',
  'ownership',
  'approvingAuthority',
  'amenities',
] as const satisfies readonly (keyof UpdateListingDto)[];

/** Listing columns a seller controls, same reasoning as above. */
export const SELLER_LISTING_FIELDS = [
  'title',
  'description',
  'priceNegotiable',
  'contactPreference',
] as const satisfies readonly (keyof UpdateListingDto)[];

export const documentUploadSchema = z.object({
  kind: z.nativeEnum(DocumentKind),
  /** Required when kind is ID_PROOF; validated in the refine below. */
  idProofKind: z.nativeEnum(IdProofKind).optional(),
});

export const documentUploadRefined = documentUploadSchema
  .refine(
    (data) => data.kind !== DocumentKind.ID_PROOF || data.idProofKind !== undefined,
    { message: 'Specify which kind of identity document this is', path: ['idProofKind'] },
  )
  /*
   * And the converse, which was missing: a sale deed carrying "PAN" was
   * accepted and then displayed to the officer as "sale deed · pan". Nonsense
   * on a screen whose entire purpose is deciding whether documents match their
   * description.
   */
  .refine(
    (data) => data.kind === DocumentKind.ID_PROOF || data.idProofKind === undefined,
    {
      message: 'Only an identity proof can specify which identity document it is',
      path: ['idProofKind'],
    },
  );

export type DocumentUploadDto = z.infer<typeof documentUploadSchema>;

/**
 * Documents a seller must supply before a listing can be reviewed.
 * Mirrors the PRD's "Required Documents" for listing submission.
 */
export const REQUIRED_DOCUMENT_KINDS: readonly DocumentKind[] = [
  DocumentKind.SALE_DEED,
  DocumentKind.ID_PROOF,
  DocumentKind.PROPERTY_TAX_RECEIPT,
];

/**
 * Photo display order.
 *
 * The whole set is sent, not a single move, so the result is unambiguous: a
 * "move photo 3 up" API has to be applied against the client's assumed order,
 * and two quick clicks race into an order neither the seller nor the server
 * intended.
 *
 * The first entry is the cover. There is no separate `isCover` column because
 * two rows could then both claim it, and nothing in the schema would stop them.
 */
export const reorderPhotosSchema = z.object({
  order: z
    .array(z.string().uuid())
    .min(1, 'Send the photo order')
    .max(MAX_PHOTOS)
    .refine((ids) => new Set(ids).size === ids.length, 'A photo can appear only once'),
});

export type ReorderPhotosDto = z.infer<typeof reorderPhotosSchema>;

/**
 * Window for the seller's performance figures.
 *
 * Capped at a year: the series returns one row per day, and an unbounded range
 * would let a single request build an arbitrarily large response.
 */
export const statsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
});

export type StatsQueryDto = z.infer<typeof statsQuerySchema>;

export const confirmAvailabilitySchema = z.object({
  stillAvailable: z.boolean(),
});

export type ConfirmAvailabilityDto = z.infer<typeof confirmAvailabilitySchema>;

/**
 * Taking a listing off the market for now.
 *
 * The reason is optional and is only ever shown back to the seller. Requiring
 * one would add friction to the behaviour we most want to encourage — pausing
 * the moment a property stops being available, rather than leaving it up.
 */
export const pauseListingSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export type PauseListingDto = z.infer<typeof pauseListingSchema>;

/**
 * Reporting a sale.
 *
 * Both details are optional. A seller who has just sold owes us nothing, and a
 * form that interrogates them is one they will skip — leaving the listing up,
 * which is the outcome this whole feature exists to prevent. The sale price is
 * worth asking for because every other price on the platform is an asking
 * price; `soldThroughPlatform` is worth asking because it is the only honest
 * measure of whether we did our job.
 */
export const markSoldSchema = z.object({
  soldPrice: priceSchema.optional(),
  soldThroughPlatform: z.boolean().optional(),
});

export type MarkSoldDto = z.infer<typeof markSoldSchema>;
