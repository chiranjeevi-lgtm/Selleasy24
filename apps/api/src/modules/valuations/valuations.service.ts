import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@kamala/db';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { EstimateDto } from './valuations.dto';

/**
 * Minimum number of comparables to feel comfortable publishing a range.
 * Below this, we return a `low` confidence flag and a wider band rather
 * than pretending we know.
 */
const CONFIDENCE_MIN_HIGH = 20;
const CONFIDENCE_MIN_MEDIUM = 10;
const CONFIDENCE_MIN_LOW = 5;

/**
 * How wide the config filter should be, relative to the target.
 *  - ±1 BHK
 *  - ±20% area
 * Widened just enough to catch real comparables while staying honest —
 * a 4-BHK duplex is not a comp for a 2-BHK studio.
 */
const BEDROOMS_TOLERANCE = 1;
const AREA_TOLERANCE_RATIO = 0.2;

interface Comparable {
  listingId: string;
  distanceKm: number | null;
  bedrooms: number;
  areaSqft: number;
  pricePerSqft: number;
  firstListedAt: Date | null;
  weight: number;
}

export interface ValuationResult {
  estimatedLow: number;
  estimatedMid: number;
  estimatedHigh: number;
  perSqft: { low: number; mid: number; high: number };
  comparableCount: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  method: 'radius_config_match' | 'locality_median' | 'insufficient_data';
  /// Up to 10 comparables surfaced to the user, sorted by weight desc.
  /// Deliberately does not include listing addresses or seller info —
  /// this is a decision aid, not a way to bulk-scrape.
  comparables: Array<{
    distanceKm: number | null;
    bedrooms: number;
    areaSqft: number;
    pricePerSqft: number;
    firstListedAt: string | null;
  }>;
  disclaimer: string;
}

@Injectable()
export class ValuationsService {
  private readonly logger = new Logger(ValuationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async estimate(input: EstimateDto): Promise<ValuationResult> {
    const useCoords = input.latitude !== undefined && input.longitude !== undefined;

    const comparables = useCoords
      ? await this.fetchByRadius(input)
      : await this.fetchByNeighborhood(input);

    if (comparables.length < CONFIDENCE_MIN_LOW) {
      // Not enough data — fall through to a locality-median estimate if we
      // have that, or return insufficient. Never fabricate.
      this.logger.debug(
        `Insufficient comparables (${comparables.length}) for valuation in ${input.neighborhoodId ?? `${input.latitude},${input.longitude}`}`,
      );
      return this.insufficientDataResult(comparables.length);
    }

    const weighted = this.weight(comparables, input);
    const percentiles = this.weightedPercentiles(weighted);

    const confidence = this.confidenceFrom(weighted.length);

    return {
      estimatedLow: Math.round(percentiles.p25 * input.areaSqft),
      estimatedMid: Math.round(percentiles.p50 * input.areaSqft),
      estimatedHigh: Math.round(percentiles.p75 * input.areaSqft),
      perSqft: {
        low: Math.round(percentiles.p25),
        mid: Math.round(percentiles.p50),
        high: Math.round(percentiles.p75),
      },
      comparableCount: weighted.length,
      confidence,
      method: useCoords ? 'radius_config_match' : 'locality_median',
      comparables: weighted
        .slice()
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10)
        .map((c) => ({
          distanceKm: c.distanceKm,
          bedrooms: c.bedrooms,
          areaSqft: c.areaSqft,
          pricePerSqft: Math.round(c.pricePerSqft),
          firstListedAt: c.firstListedAt?.toISOString() ?? null,
        })),
      disclaimer:
        'Estimate reflects verified inventory on SellEasy24 only. Actual market value depends on floor, view, exact configuration, and factors a comparables model cannot see.',
    };
  }

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  private async fetchByRadius(input: EstimateDto): Promise<Comparable[]> {
    const lat = input.latitude!;
    const lng = input.longitude!;
    const minBed = Math.max(0, input.bedrooms - BEDROOMS_TOLERANCE);
    const maxBed = input.bedrooms + BEDROOMS_TOLERANCE;
    const minArea = Math.round(input.areaSqft * (1 - AREA_TOLERANCE_RATIO));
    const maxArea = Math.round(input.areaSqft * (1 + AREA_TOLERANCE_RATIO));
    const radiusMeters = input.radiusKm * 1000;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        price: number;
        area_sqft: number;
        bedrooms: number;
        first_listed_at: Date | null;
        km: number;
      }>
    >(Prisma.sql`
      SELECT
        l."id" AS id,
        l."price"::float8 AS price,
        p."areaSqft" AS area_sqft,
        p."bedrooms" AS bedrooms,
        l."firstListedAt" AS first_listed_at,
        ST_Distance(
          ST_SetSRID(ST_MakePoint(p."longitude"::float8, p."latitude"::float8), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography
        ) / 1000 AS km
      FROM "listings" l
      JOIN "properties" p ON p."id" = l."propertyId"
      WHERE l."status" = 'APPROVED'::"ListingStatus"
        AND l."isVerified" = true
        AND p."areaSqft" > 0
        AND p."latitude" IS NOT NULL
        AND p."longitude" IS NOT NULL
        AND p."propertyType" = ${input.propertyType}::"PropertyType"
        AND p."bedrooms" BETWEEN ${minBed} AND ${maxBed}
        AND p."areaSqft" BETWEEN ${minArea} AND ${maxArea}
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(p."longitude"::float8, p."latitude"::float8), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
          ${radiusMeters}::float8
        )
      ORDER BY km ASC
      LIMIT 50
    `);

    return rows.map((row) => ({
      listingId: row.id,
      distanceKm: row.km,
      bedrooms: row.bedrooms,
      areaSqft: row.area_sqft,
      pricePerSqft: row.price / row.area_sqft,
      firstListedAt: row.first_listed_at,
      weight: 0,
    }));
  }

  private async fetchByNeighborhood(input: EstimateDto): Promise<Comparable[]> {
    const minBed = Math.max(0, input.bedrooms - BEDROOMS_TOLERANCE);
    const maxBed = input.bedrooms + BEDROOMS_TOLERANCE;
    const minArea = Math.round(input.areaSqft * (1 - AREA_TOLERANCE_RATIO));
    const maxArea = Math.round(input.areaSqft * (1 + AREA_TOLERANCE_RATIO));

    const listings = await this.prisma.listing.findMany({
      where: {
        status: 'APPROVED',
        isVerified: true,
        property: {
          neighborhoodId: input.neighborhoodId!,
          propertyType: input.propertyType,
          bedrooms: { gte: minBed, lte: maxBed },
          areaSqft: { gte: minArea, lte: maxArea },
        },
      },
      select: {
        id: true,
        price: true,
        firstListedAt: true,
        property: { select: { bedrooms: true, areaSqft: true } },
      },
      take: 50,
    });

    return listings
      .filter((l) => l.property.areaSqft > 0)
      .map((l) => ({
        listingId: l.id,
        distanceKm: null,
        bedrooms: l.property.bedrooms,
        areaSqft: l.property.areaSqft,
        pricePerSqft: Number(l.price) / l.property.areaSqft,
        firstListedAt: l.firstListedAt,
        weight: 0,
      }));
  }

  // -------------------------------------------------------------------------
  // Weighting + percentiles
  // -------------------------------------------------------------------------

  /**
   * Each comparable gets a weight reflecting how much like the target it
   * really is. Four factors, multiplied:
   *   distance     — closer scores higher (1.0 at 0 km, 0.3 at radius)
   *   config       — exact BHK match scores higher than ±1
   *   area         — closer areaSqft scores higher
   *   recency      — newer listings score higher (0.5 at 2 years old)
   *
   * All four are floors at some minimum > 0 so a comparable with one weak
   * signal isn't excluded entirely. The weighted percentile that emerges
   * is meaningfully different from an unweighted median once inputs vary.
   */
  private weight(comparables: Comparable[], input: EstimateDto): Comparable[] {
    const now = Date.now();
    return comparables.map((c) => {
      // Distance factor
      let distanceFactor = 1;
      if (c.distanceKm !== null) {
        const normalised = Math.min(1, c.distanceKm / input.radiusKm);
        distanceFactor = Math.max(0.3, 1 - normalised * 0.7);
      }

      // Config factor — exact BHK match dominates
      const bedroomDelta = Math.abs(c.bedrooms - input.bedrooms);
      const configFactor = bedroomDelta === 0 ? 1 : 0.7;

      // Area factor — squared decay away from target
      const areaDelta = Math.abs(c.areaSqft - input.areaSqft) / input.areaSqft;
      const areaFactor = Math.max(0.5, 1 - areaDelta * areaDelta * 2);

      // Recency factor
      let recencyFactor = 0.7;
      if (c.firstListedAt) {
        const ageDays = (now - c.firstListedAt.getTime()) / 86_400_000;
        recencyFactor = Math.max(0.5, 1 - ageDays / 730); // 2 years → 0.5
      }

      const weight = distanceFactor * configFactor * areaFactor * recencyFactor;
      return { ...c, weight };
    });
  }

  private weightedPercentiles(comparables: Comparable[]): {
    p25: number;
    p50: number;
    p75: number;
  } {
    const sorted = comparables
      .slice()
      .sort((a, b) => a.pricePerSqft - b.pricePerSqft);
    const totalWeight = sorted.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight === 0) {
      // Degrade to unweighted — should never happen given the weight floors
      // above, but a runtime NaN is worse than a silent equal-weight fallback.
      const values = sorted.map((c) => c.pricePerSqft);
      return {
        p25: values[Math.floor(values.length * 0.25)] ?? 0,
        p50: values[Math.floor(values.length * 0.5)] ?? 0,
        p75: values[Math.floor(values.length * 0.75)] ?? 0,
      };
    }

    const pick = (percentile: number): number => {
      const target = totalWeight * percentile;
      let cumulative = 0;
      for (const c of sorted) {
        cumulative += c.weight;
        if (cumulative >= target) return c.pricePerSqft;
      }
      return sorted[sorted.length - 1]?.pricePerSqft ?? 0;
    };

    return {
      p25: pick(0.25),
      p50: pick(0.5),
      p75: pick(0.75),
    };
  }

  // -------------------------------------------------------------------------
  // Fallbacks + helpers
  // -------------------------------------------------------------------------

  private confidenceFrom(count: number): ValuationResult['confidence'] {
    if (count >= CONFIDENCE_MIN_HIGH) return 'high';
    if (count >= CONFIDENCE_MIN_MEDIUM) return 'medium';
    if (count >= CONFIDENCE_MIN_LOW) return 'low';
    return 'insufficient';
  }

  private insufficientDataResult(actualCount: number): ValuationResult {
    return {
      estimatedLow: 0,
      estimatedMid: 0,
      estimatedHigh: 0,
      perSqft: { low: 0, mid: 0, high: 0 },
      comparableCount: actualCount,
      confidence: 'insufficient',
      method: 'insufficient_data',
      comparables: [],
      disclaimer:
        `Only ${actualCount} comparable listing${actualCount === 1 ? '' : 's'} matched — not enough to publish an honest range. Widen the radius or check back once more inventory in this configuration is verified.`,
    };
  }
}
