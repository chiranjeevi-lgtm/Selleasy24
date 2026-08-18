import { ListingStatus, Prisma } from '@prisma/client';

export * from '@prisma/client';
export { PrismaClient } from '@prisma/client';

/**
 * The ONLY condition under which a listing may be shown to an unauthenticated
 * visitor or a buyer.
 *
 * This lives in the data package rather than in a controller on purpose. Public
 * exposure of a DRAFT, PENDING_REVIEW, REJECTED or SUSPENDED listing is the
 * worst failure this platform can have — it would publish unverified ownership
 * claims under a brand whose entire promise is verification.
 *
 * Rules:
 *  - Every public read path composes this via {@link publicListingWhere}.
 *  - Never hand-write `status: 'APPROVED'` in a query. Grep for
 *    PUBLIC_LISTING_WHERE to audit every public read in one search.
 *  - Seller-scoped and admin-scoped queries deliberately bypass this and must
 *    apply their own ownership or role check instead.
 */
export const PUBLIC_LISTING_WHERE = {
  status: ListingStatus.APPROVED,
  isVerified: true,
} satisfies Prisma.ListingWhereInput;

/**
 * Composes additional filters onto the public visibility rule.
 *
 * The visibility conditions are spread last so a caller cannot accidentally
 * widen them — passing `{ status: 'DRAFT' }` is overridden, not honoured.
 */
export function publicListingWhere(
  extra: Prisma.ListingWhereInput = {},
): Prisma.ListingWhereInput {
  return { ...extra, ...PUBLIC_LISTING_WHERE };
}

/**
 * Fields safe to return on a public listing response.
 *
 * Explicitly omits `rejectionReason`, `revisionNote` and `verifiedById`, which
 * are seller- or staff-only. Prisma's default `include` returns every scalar,
 * so public endpoints select rather than include.
 */
export const PUBLIC_LISTING_SELECT = {
  id: true,
  title: true,
  description: true,
  price: true,
  priceNegotiable: true,
  isVerified: true,
  firstListedAt: true,
  lastConfirmedAt: true,
  verifiedAt: true,
  viewsCount: true,
  property: {
    select: {
      id: true,
      address: true,
      pincode: true,
      propertyType: true,
      bedrooms: true,
      bathrooms: true,
      areaSqft: true,
      yearBuilt: true,
      neighborhood: {
        select: {
          id: true,
          name: true,
          city: true,
          pincode: true,
          medianPricePerSqft: true,
          medianSampleSize: true,
        },
      },
    },
  },
  photos: {
    select: { id: true, storageKey: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  },
  // Seller identity is reduced to the Owner/Broker label. A seller's email and
  // phone are never present in a public payload — a buyer contacts them through
  // a lead, not by scraping a contact field.
  seller: {
    select: { id: true, fullName: true, sellerKind: true },
  },
} satisfies Prisma.ListingSelect;

/**
 * Public detail response — the search select plus the full structured field set.
 *
 * Kept separate rather than folded into `PUBLIC_LISTING_SELECT` because that one
 * also serves search results. A results page returns up to 50 listings, and
 * every one would carry an amenity array and a dozen extra columns that nothing
 * on a card renders.
 */
export const PUBLIC_LISTING_DETAIL_SELECT = {
  ...PUBLIC_LISTING_SELECT,
  contactPreference: true,
  property: {
    select: {
      ...PUBLIC_LISTING_SELECT.property.select,
      carpetAreaSqft: true,
      balconies: true,
      floor: true,
      totalFloors: true,
      possession: true,
      furnishing: true,
      facing: true,
      coveredParking: true,
      openParking: true,
      ownership: true,
      approvingAuthority: true,
      amenities: true,
    },
  },
} satisfies Prisma.ListingSelect;
