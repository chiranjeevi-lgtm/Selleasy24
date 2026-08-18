import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  PUBLIC_LISTING_DETAIL_SELECT,
  PUBLIC_LISTING_SELECT,
  publicListingWhere,
} from '@kamala/db';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { Env } from '../../config/env.schema';
import { MEDIAN_TTL_MS, MIN_MEDIAN_SAMPLE, type SearchQueryDto } from './search.dto';

export interface LocalityBenchmark {
  medianPricePerSqft: number | null;
  sampleSize: number;
  /** Null when there is no meaningful median to compare against. */
  differencePercent: number | null;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /**
   * Public listing search.
   *
   * Executed as two steps: a raw SQL query that resolves matching listing ids in
   * the correct order, then a typed Prisma hydration of those ids.
   *
   * Raw SQL for the first step is deliberate — it is the only way to use the
   * full-text index (`to_tsvector('english', title || ' ' || description)`) and
   * to rank by relevance. Every value is passed as a bound parameter via
   * Prisma.sql, so nothing is interpolated into the statement text.
   *
   * The visibility predicate mirrors PUBLIC_LISTING_WHERE. It is repeated here
   * because raw SQL cannot compose the Prisma filter object; the partial index
   * `listings_public_recent_idx` uses the same predicate.
   */
  async search(query: SearchQueryDto) {
    const conditions: Prisma.Sql[] = [
      // Visibility — must always be first and must never be optional.
      Prisma.sql`l."status" = 'APPROVED'::"ListingStatus" AND l."isVerified" = true`,
    ];

    if (query.q) {
      conditions.push(
        Prisma.sql`to_tsvector('english', l."title" || ' ' || l."description") @@ plainto_tsquery('english', ${query.q})`,
      );
    }
    if (query.city) {
      conditions.push(Prisma.sql`n."city" ILIKE ${query.city}`);
    }
    if (query.neighborhoodId) {
      conditions.push(Prisma.sql`p."neighborhoodId" = ${query.neighborhoodId}::uuid`);
    }
    if (query.pincode) {
      conditions.push(Prisma.sql`p."pincode" = ${query.pincode}`);
    }
    if (query.propertyType && query.propertyType.length > 0) {
      // ANY() rather than an OR chain: one bound parameter regardless of how
      // many types were selected, and it still uses the propertyType index.
      conditions.push(
        Prisma.sql`p."propertyType" = ANY(${query.propertyType}::"PropertyType"[])`,
      );
    }
    if (query.bedrooms && query.bedrooms.length > 0) {
      conditions.push(Prisma.sql`p."bedrooms" = ANY(${query.bedrooms}::int[])`);
    }
    if (query.minBedrooms !== undefined) {
      conditions.push(Prisma.sql`p."bedrooms" >= ${query.minBedrooms}`);
    }
    if (query.minPrice !== undefined) {
      conditions.push(Prisma.sql`l."price" >= ${query.minPrice}`);
    }
    if (query.maxPrice !== undefined) {
      conditions.push(Prisma.sql`l."price" <= ${query.maxPrice}`);
    }
    if (query.minAreaSqft !== undefined) {
      conditions.push(Prisma.sql`p."areaSqft" >= ${query.minAreaSqft}`);
    }
    if (query.maxAreaSqft !== undefined) {
      conditions.push(Prisma.sql`p."areaSqft" <= ${query.maxAreaSqft}`);
    }
    if (query.ownersOnly) {
      conditions.push(Prisma.sql`u."sellerKind" = 'OWNER'::"SellerKind"`);
    }

    // --- Structured filters ---
    if (query.possession) {
      conditions.push(Prisma.sql`p."possession" = ${query.possession}::"PossessionStatus"`);
    }
    if (query.furnishing) {
      conditions.push(Prisma.sql`p."furnishing" = ${query.furnishing}::"FurnishingStatus"`);
    }
    if (query.facing) {
      conditions.push(Prisma.sql`p."facing" = ${query.facing}::"FacingDirection"`);
    }
    if (query.ownership) {
      conditions.push(Prisma.sql`p."ownership" = ${query.ownership}::"OwnershipType"`);
    }
    if (query.approvingAuthority) {
      conditions.push(
        Prisma.sql`p."approvingAuthority" = ${query.approvingAuthority}::"ApprovingAuthority"`,
      );
    }

    if (query.amenities && query.amenities.length > 0) {
      /*
       * `@>` is "contains every one of", which is the AND the PRD asks for, and
       * it is the operator the GIN index on this column serves. Building an
       * `AND amenities @> ...` chain per amenity instead would not use it.
       */
      conditions.push(
        Prisma.sql`p."amenities" @> ${query.amenities}::"Amenity"[]`,
      );
    }

    if (query.minFloor !== undefined) {
      conditions.push(Prisma.sql`p."floor" >= ${query.minFloor}`);
    }
    if (query.maxFloor !== undefined) {
      conditions.push(Prisma.sql`p."floor" <= ${query.maxFloor}`);
    }

    if (query.maxAgeYears !== undefined) {
      /*
       * Compared against the current year at query time rather than a stored
       * age, so results do not quietly go stale on 1 January. Listings with no
       * construction year are excluded: "at most 5 years old" cannot honestly
       * include a property whose age nobody recorded.
       */
      const earliestYear = new Date().getUTCFullYear() - query.maxAgeYears;
      conditions.push(Prisma.sql`p."yearBuilt" IS NOT NULL AND p."yearBuilt" >= ${earliestYear}`);
    }

    const where = Prisma.join(conditions, ' AND ');

    const orderBy = this.buildOrderBy(query);

    // A window function returns the unfiltered total alongside the page, so
    // pagination does not need a second round trip.
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; total: bigint }>
    >(Prisma.sql`
      SELECT l."id", COUNT(*) OVER () AS total
      FROM "listings" l
      JOIN "properties" p ON p."id" = l."propertyId"
      JOIN "neighborhoods" n ON n."id" = p."neighborhoodId"
      JOIN "users" u ON u."id" = l."sellerId"
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${query.limit} OFFSET ${query.offset}
    `);

    const total = rows.length > 0 ? Number(rows[0]!.total) : 0;
    const ids = rows.map((r) => r.id);

    if (ids.length === 0) {
      return { total: 0, limit: query.limit, offset: query.offset, items: [] };
    }

    // Hydrate through Prisma so the response shape stays typed and the
    // public field allowlist is applied.
    const listings = await this.prisma.listing.findMany({
      where: publicListingWhere({ id: { in: ids } }),
      select: PUBLIC_LISTING_SELECT,
    });

    // findMany does not preserve the `in` order, so restore the ranking.
    const byId = new Map(listings.map((l) => [l.id, l]));
    const ordered = ids.map((id) => byId.get(id)).filter((l): l is NonNullable<typeof l> => Boolean(l));

    return {
      total,
      limit: query.limit,
      offset: query.offset,
      items: ordered.map((listing) => this.toCard(listing)),
    };
  }

  private buildOrderBy(query: SearchQueryDto): Prisma.Sql {
    switch (query.sort) {
      case 'priceAsc':
        return Prisma.sql`l."price" ASC NULLS LAST`;
      case 'priceDesc':
        return Prisma.sql`l."price" DESC NULLS LAST`;
      case 'areaDesc':
        return Prisma.sql`p."areaSqft" DESC NULLS LAST`;
      case 'relevance':
        // q is guaranteed present when sort is relevance (enforced in the DTO).
        return Prisma.sql`ts_rank(to_tsvector('english', l."title" || ' ' || l."description"), plainto_tsquery('english', ${query.q ?? ''})) DESC, l."firstListedAt" DESC NULLS LAST`;
      case 'newest':
      default:
        // firstListedAt, never createdAt or updatedAt — the honest listing date.
        return Prisma.sql`l."firstListedAt" DESC NULLS LAST`;
    }
  }

  // -------------------------------------------------------------------------
  // Detail
  // -------------------------------------------------------------------------

  /**
   * Public listing detail.
   *
   * Records a deduplicated view and returns the locality price benchmark — the
   * number incumbents compute and then hide behind a lead-capture wall.
   */
  async getPublicListing(
    listingId: string,
    viewer: { ip?: string | undefined; userAgent?: string | undefined; userId?: string | undefined },
  ) {
    const listing = await this.prisma.listing.findFirst({
      where: publicListingWhere({ id: listingId }),
      // Detail carries the full structured field set; the search select above
      // deliberately does not.
      select: PUBLIC_LISTING_DETAIL_SELECT,
    });

    if (!listing) {
      throw new NotFoundException('Listing not found.');
    }

    // Never let a seller inflate their own view count.
    if (viewer.userId !== listing.seller.id) {
      await this.recordView(listingId, viewer);
    }

    const benchmark = await this.getLocalityBenchmark(
      listing.property.neighborhood.id,
      this.pricePerSqft(listing.price, listing.property.areaSqft),
    );

    const priceHistory = await this.prisma.priceHistory.findMany({
      where: { listingId },
      orderBy: { changedAt: 'desc' },
      take: 10,
      select: { price: true, previousPrice: true, changedAt: true },
    });

    const card = this.toCard(listing);

    return {
      ...card,
      description: listing.description,
      priceNegotiable: listing.priceNegotiable,
      contactPreference: listing.contactPreference,
      /*
       * The structured field set, layered onto the card's lean property shape.
       * `toCard` is shared with search results and deliberately drops these, so
       * they have to be re-attached here or the detail page renders "Not
       * specified" for data that is actually present.
       */
      property: {
        ...card.property,
        carpetAreaSqft: listing.property.carpetAreaSqft,
        balconies: listing.property.balconies,
        floor: listing.property.floor,
        totalFloors: listing.property.totalFloors,
        possession: listing.property.possession,
        furnishing: listing.property.furnishing,
        facing: listing.property.facing,
        coveredParking: listing.property.coveredParking,
        openParking: listing.property.openParking,
        ownership: listing.property.ownership,
        approvingAuthority: listing.property.approvingAuthority,
        amenities: listing.property.amenities,
      },
      localityBenchmark: benchmark,
      /**
       * Public price history. "Reduced from ₹85L" is a genuine trust signal and
       * the reason PriceHistory has been written since day one.
       */
      priceHistory: priceHistory.map((entry) => ({
        price: Number(entry.price),
        previousPrice: entry.previousPrice === null ? null : Number(entry.previousPrice),
        changedAt: entry.changedAt,
      })),
    };
  }

  /**
   * Side-by-side comparison data.
   *
   * Deliberately not N calls to `getPublicListing`: that records a view, so
   * putting four homes side by side would count four views and inflate the
   * "N people viewed this" figure sellers are shown. Comparing is browsing, not
   * visiting.
   *
   * Returns the same field set as the detail response so the comparison table
   * and the detail page cannot disagree about a property.
   */
  async compare(ids: string[]) {
    const listings = await this.prisma.listing.findMany({
      // The public predicate still applies — an unverified or withdrawn listing
      // must not become reachable just because its id was pasted into a URL.
      where: publicListingWhere({ id: { in: ids } }),
      select: PUBLIC_LISTING_DETAIL_SELECT,
    });

    const byId = new Map(listings.map((listing) => [listing.id, listing]));

    /*
     * Ordered by the caller's ids, not the database's. Prisma returns rows in
     * whatever order the planner produces, which would shuffle the columns
     * between page loads and make two homes look like they had swapped values.
     *
     * Ids that no longer resolve are dropped rather than erroring: a listing
     * sold and archived between adding it and opening the comparison is normal,
     * and should not blank the whole page.
     */
    const ordered = ids.map((id) => byId.get(id)).filter((listing) => listing !== undefined);

    return {
      items: ordered.map((listing) => ({
        ...this.toCard(listing),
        description: listing.description,
        property: {
          ...this.toCard(listing).property,
          carpetAreaSqft: listing.property.carpetAreaSqft,
          balconies: listing.property.balconies,
          floor: listing.property.floor,
          totalFloors: listing.property.totalFloors,
          possession: listing.property.possession,
          furnishing: listing.property.furnishing,
          facing: listing.property.facing,
          coveredParking: listing.property.coveredParking,
          openParking: listing.property.openParking,
          ownership: listing.property.ownership,
          approvingAuthority: listing.property.approvingAuthority,
          amenities: listing.property.amenities,
        },
      })),
      /** Ids the caller asked for that are no longer publicly visible. */
      unavailable: ids.filter((id) => !byId.has(id)),
    };
  }

  // -------------------------------------------------------------------------
  // View counting
  // -------------------------------------------------------------------------

  /**
   * Records at most one view per viewer per listing per day.
   *
   * The viewer is identified by a salted hash of IP + user-agent. The raw IP is
   * never stored: we need "is this the same person as five minutes ago", not
   * "who is this", and storing the IP would be collecting personal data we have
   * no use for.
   *
   * Salted with a server secret so the hash cannot be reversed by brute-forcing
   * the (small) IPv4 space.
   */
  private async recordView(
    listingId: string,
    viewer: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<void> {
    const salt = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const today = new Date();
    const dayKey = today.toISOString().slice(0, 10);

    const sessionHash = createHash('sha256')
      .update(`${salt}|${viewer.ip ?? 'unknown'}|${viewer.userAgent ?? 'unknown'}|${dayKey}`)
      .digest('hex');

    const viewedOn = new Date(`${dayKey}T00:00:00.000Z`);

    try {
      // The unique constraint on (listingId, sessionHash, viewedOn) makes the
      // dedup atomic; a repeat view is a no-op rather than a read-then-write race.
      await this.prisma.$transaction([
        this.prisma.listingView.create({ data: { listingId, sessionHash, viewedOn } }),
        this.prisma.listing.update({
          where: { id: listingId },
          data: { viewsCount: { increment: 1 } },
        }),
      ]);
    } catch (error) {
      // P2002 = repeat view today. Expected and silent.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      // Any other failure must not break the page — a view count is not worth a
      // 500 on a listing detail request.
      this.logger.warn(
        `View recording failed for ${listingId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Locality benchmark
  // -------------------------------------------------------------------------

  /**
   * Median price per sq ft for a locality, cached on the neighborhood row.
   *
   * Recomputed lazily when stale, so it is self-healing without a scheduler.
   * Returns null below MIN_MEDIAN_SAMPLE approved listings: a "locality median"
   * derived from two properties is worse than no number at all, because a buyer
   * would treat it as authoritative.
   */
  async getLocalityBenchmark(
    neighborhoodId: string,
    listingPricePerSqft: number | null,
  ): Promise<LocalityBenchmark> {
    const neighborhood = await this.prisma.neighborhood.findUnique({
      where: { id: neighborhoodId },
      select: { medianPricePerSqft: true, medianSampleSize: true, medianComputedAt: true },
    });

    const isStale =
      !neighborhood?.medianComputedAt ||
      Date.now() - neighborhood.medianComputedAt.getTime() > MEDIAN_TTL_MS;

    const stats = isStale
      ? await this.recomputeLocalityMedian(neighborhoodId)
      : {
          median:
            neighborhood.medianPricePerSqft === null
              ? null
              : Number(neighborhood.medianPricePerSqft),
          sampleSize: neighborhood.medianSampleSize ?? 0,
        };

    const differencePercent =
      stats.median !== null && stats.median > 0 && listingPricePerSqft !== null
        ? Math.round(((listingPricePerSqft - stats.median) / stats.median) * 1000) / 10
        : null;

    return {
      medianPricePerSqft: stats.median,
      sampleSize: stats.sampleSize,
      differencePercent,
    };
  }

  /** Recomputes and caches one locality's median. Public so a job can call it. */
  async recomputeLocalityMedian(
    neighborhoodId: string,
  ): Promise<{ median: number | null; sampleSize: number }> {
    const result = await this.prisma.$queryRaw<
      Array<{ median: number | null; sample: bigint }>
    >(Prisma.sql`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY (l."price" / NULLIF(p."areaSqft", 0))
        )::float8 AS median,
        COUNT(*) AS sample
      FROM "listings" l
      JOIN "properties" p ON p."id" = l."propertyId"
      WHERE p."neighborhoodId" = ${neighborhoodId}::uuid
        AND l."status" = 'APPROVED'::"ListingStatus"
        AND l."isVerified" = true
        AND p."areaSqft" > 0
    `);

    const row = result[0];
    const sampleSize = row ? Number(row.sample) : 0;
    const median =
      row && row.median !== null && sampleSize >= MIN_MEDIAN_SAMPLE
        ? Math.round(row.median * 100) / 100
        : null;

    await this.prisma.neighborhood.update({
      where: { id: neighborhoodId },
      data: {
        medianPricePerSqft: median,
        medianSampleSize: sampleSize,
        medianComputedAt: new Date(),
      },
    });

    return { median, sampleSize };
  }

  /** Recomputes every locality. Intended for a scheduled job. */
  async recomputeAllLocalityMedians(): Promise<{ updated: number }> {
    const neighborhoods = await this.prisma.neighborhood.findMany({ select: { id: true } });
    for (const { id } of neighborhoods) {
      await this.recomputeLocalityMedian(id);
    }
    return { updated: neighborhoods.length };
  }

  // -------------------------------------------------------------------------
  // Reference data
  // -------------------------------------------------------------------------

  /** Localities for search dropdowns. Fixed reference data, never free text. */
  async neighborhoods(city?: string) {
    return this.prisma.neighborhood.findMany({
      where: city ? { city: { equals: city, mode: 'insensitive' } } : undefined,
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        pincode: true,
        medianPricePerSqft: true,
        medianSampleSize: true,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Shaping
  // -------------------------------------------------------------------------

  private pricePerSqft(price: Prisma.Decimal, areaSqft: number): number | null {
    if (areaSqft <= 0) {
      return null;
    }
    return Math.round((Number(price) / areaSqft) * 100) / 100;
  }

  private toCard(listing: {
    id: string;
    title: string;
    price: Prisma.Decimal;
    isVerified: boolean;
    firstListedAt: Date | null;
    lastConfirmedAt: Date | null;
    verifiedAt: Date | null;
    viewsCount: number;
    property: {
      id: string;
      address: string;
      pincode: string;
      propertyType: string;
      bedrooms: number;
      bathrooms: number;
      areaSqft: number;
      yearBuilt: number | null;
      neighborhood: { id: string; name: string; city: string; pincode: string };
    };
    photos: Array<{ id: string; storageKey: string; sortOrder: number }>;
    seller: { id: string; fullName: string; sellerKind: string | null };
  }) {
    return {
      id: listing.id,
      title: listing.title,
      price: Number(listing.price),
      /** Expected on every Indian property listing; computed, not stored. */
      pricePerSqft: this.pricePerSqft(listing.price, listing.property.areaSqft),
      isVerified: listing.isVerified,
      verifiedAt: listing.verifiedAt,
      /** Immutable first-publication date — the honest "listed N days ago". */
      firstListedAt: listing.firstListedAt,
      lastConfirmedAt: listing.lastConfirmedAt,
      property: {
        address: listing.property.address,
        pincode: listing.property.pincode,
        propertyType: listing.property.propertyType,
        bedrooms: listing.property.bedrooms,
        bathrooms: listing.property.bathrooms,
        areaSqft: listing.property.areaSqft,
        yearBuilt: listing.property.yearBuilt,
        locality: listing.property.neighborhood.name,
        city: listing.property.neighborhood.city,
      },
      photos: listing.photos.map((photo) => ({
        id: photo.id,
        url: this.storage.publicUrl(photo.storageKey),
        sortOrder: photo.sortOrder,
      })),
      /**
       * Owner vs Broker, stated plainly. The seller's contact details are NOT
       * here — a buyer reaches them by submitting a lead, which is what keeps
       * phone numbers out of scrapers' hands.
       */
      listedBy: {
        name: listing.seller.fullName,
        kind: listing.seller.sellerKind,
      },
      // Deliberately absent from public payloads: viewsCount. Withheld until
      // inventory is dense enough that a low number does not make a listing look
      // dead. The seller sees it on their own dashboard.
    };
  }
}
