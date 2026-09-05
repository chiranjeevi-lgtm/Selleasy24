import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@kamala/db';

import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Below this number of listings, the median is too noisy to publish —
 * two arrivals can swing it by 30%. Matches the search module's own
 * MIN_MEDIAN_SAMPLE so the two computations agree on what counts as
 * "enough data."
 */
const MIN_MEDIAN_SAMPLE = 3;

/**
 * The three appreciation windows we surface publicly. These translate to
 * "N years ago from today" when we look up the historical snapshot.
 */
const APPRECIATION_WINDOWS = [
  { key: '1yr' as const, months: 12 },
  { key: '3yr' as const, months: 36 },
  { key: '5yr' as const, months: 60 },
];

interface SnapshotRow {
  snapshotDate: Date;
  medianPricePerSqft: number | null;
  listingCount: number;
  sampleSize: number;
  avgDaysOnMarket: number | null;
}

/**
 * Locality analytics — daily snapshots + trend queries.
 *
 * This service owns the write side (computing a snapshot for a locality)
 * and the read side (surfacing snapshots + appreciation to the public
 * pages). The compute is idempotent per day thanks to the unique
 * (neighborhoodId, snapshotDate) constraint, so a nightly job that fires
 * twice does not double-count anything.
 *
 * Kept in its own module rather than folded into SearchService to keep the
 * search boundary tight — search resolves queries, analytics builds
 * historical intelligence. They share the same underlying tables but
 * different concerns.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Compute
  // -------------------------------------------------------------------------

  /**
   * Recomputes today's snapshot for one locality. Upserts on the day so
   * running twice is safe.
   */
  async computeSnapshot(neighborhoodId: string): Promise<SnapshotRow> {
    const locality = await this.prisma.neighborhood.findUnique({
      where: { id: neighborhoodId },
      select: { id: true },
    });
    if (!locality) {
      throw new NotFoundException('Locality not found');
    }

    const stats = await this.prisma.$queryRaw<
      Array<{
        median: number | null;
        listing_count: bigint;
        sample: bigint;
        avg_dom: number | null;
      }>
    >(Prisma.sql`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY (l."price" / NULLIF(p."areaSqft", 0))
        )::float8 AS median,
        COUNT(*) AS listing_count,
        COUNT(*) FILTER (WHERE p."areaSqft" > 0 AND l."price" > 0) AS sample,
        AVG(
          EXTRACT(EPOCH FROM (COALESCE(l."soldAt", NOW()) - l."firstListedAt")) / 86400
        )::int AS avg_dom
      FROM "listings" l
      JOIN "properties" p ON p."id" = l."propertyId"
      WHERE p."neighborhoodId" = ${neighborhoodId}::uuid
        AND l."status" = 'APPROVED'::"ListingStatus"
        AND l."isVerified" = true
    `);

    const row = stats[0];
    const listingCount = row ? Number(row.listing_count) : 0;
    const sampleSize = row ? Number(row.sample) : 0;
    const median =
      row && row.median !== null && sampleSize >= MIN_MEDIAN_SAMPLE
        ? Math.round(row.median * 100) / 100
        : null;
    const avgDaysOnMarket = row?.avg_dom ?? null;

    // Truncate today to the date boundary so upsert matches yesterday's
    // row that used the same date literal.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const saved = await this.prisma.localitySnapshot.upsert({
      where: {
        neighborhoodId_snapshotDate: {
          neighborhoodId,
          snapshotDate: today,
        },
      },
      create: {
        neighborhoodId,
        snapshotDate: today,
        medianPricePerSqft: median === null ? null : new Prisma.Decimal(median),
        listingCount,
        sampleSize,
        avgDaysOnMarket,
      },
      update: {
        medianPricePerSqft: median === null ? null : new Prisma.Decimal(median),
        listingCount,
        sampleSize,
        avgDaysOnMarket,
      },
    });

    return {
      snapshotDate: saved.snapshotDate,
      medianPricePerSqft:
        saved.medianPricePerSqft === null ? null : Number(saved.medianPricePerSqft),
      listingCount: saved.listingCount,
      sampleSize: saved.sampleSize,
      avgDaysOnMarket: saved.avgDaysOnMarket,
    };
  }

  /**
   * Recompute every locality — the nightly job's inner loop. Sequential
   * rather than parallel because the PostGIS + full-scan queries would
   * saturate the connection pool if fired in parallel across ~150
   * neighborhoods.
   */
  async computeSnapshotsForAllLocalities(): Promise<{ updated: number; failed: number }> {
    const neighborhoods = await this.prisma.neighborhood.findMany({
      select: { id: true, name: true },
    });
    let updated = 0;
    let failed = 0;
    for (const { id, name } of neighborhoods) {
      try {
        await this.computeSnapshot(id);
        updated++;
      } catch (error) {
        failed++;
        this.logger.warn(
          `Snapshot compute failed for ${name} (${id}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    this.logger.log(
      `Locality snapshot batch complete — ${updated} updated, ${failed} failed`,
    );
    return { updated, failed };
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  /**
   * Latest snapshot + year-over-year appreciation for one locality.
   *
   * Appreciation is null unless we have BOTH a current snapshot AND a
   * snapshot from N months ago — we do not fabricate. If a locality was
   * seeded last month, its 5-year appreciation is null, not zero.
   */
  async getSummary(neighborhoodId: string) {
    const [locality, latest] = await Promise.all([
      this.prisma.neighborhood.findUnique({
        where: { id: neighborhoodId },
        select: { id: true, name: true, city: true },
      }),
      this.prisma.localitySnapshot.findFirst({
        where: { neighborhoodId },
        orderBy: { snapshotDate: 'desc' },
      }),
    ]);

    if (!locality) {
      throw new NotFoundException('Locality not found');
    }
    if (!latest) {
      return {
        locality,
        latest: null,
        appreciation: { '1yr': null, '3yr': null, '5yr': null },
      };
    }

    const latestMedian =
      latest.medianPricePerSqft === null ? null : Number(latest.medianPricePerSqft);

    // Look for the closest snapshot within ±30 days of each target date —
    // an exact-day match is unrealistic once the job is running daily but
    // may occasionally skip a day.
    const appreciation: Record<'1yr' | '3yr' | '5yr', number | null> = {
      '1yr': null,
      '3yr': null,
      '5yr': null,
    };

    if (latestMedian !== null) {
      for (const window of APPRECIATION_WINDOWS) {
        const target = new Date(latest.snapshotDate);
        target.setMonth(target.getMonth() - window.months);
        const windowStart = new Date(target);
        windowStart.setDate(windowStart.getDate() - 30);
        const windowEnd = new Date(target);
        windowEnd.setDate(windowEnd.getDate() + 30);

        const historical = await this.prisma.localitySnapshot.findFirst({
          where: {
            neighborhoodId,
            snapshotDate: { gte: windowStart, lte: windowEnd },
            medianPricePerSqft: { not: null },
          },
          orderBy: {
            snapshotDate: 'asc', // Closest to the target start of the window
          },
        });

        if (historical && historical.medianPricePerSqft !== null) {
          const historicalMedian = Number(historical.medianPricePerSqft);
          if (historicalMedian > 0) {
            const percent =
              Math.round(
                ((latestMedian - historicalMedian) / historicalMedian) * 1000,
              ) / 10;
            appreciation[window.key] = percent;
          }
        }
      }
    }

    return {
      locality,
      latest: {
        snapshotDate: latest.snapshotDate.toISOString().slice(0, 10),
        medianPricePerSqft: latestMedian,
        listingCount: latest.listingCount,
        sampleSize: latest.sampleSize,
        avgDaysOnMarket: latest.avgDaysOnMarket,
      },
      appreciation,
    };
  }

  /**
   * Time series for charting — one point per month over the requested
   * window. Downsampled from the daily snapshots by taking each month's
   * most recent row, so a 12-month request returns 12 points rather than
   * ~365. Front-end charts stay lightweight.
   */
  async getSeries(neighborhoodId: string, months: number) {
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    from.setHours(0, 0, 0, 0);

    const rows = await this.prisma.$queryRaw<
      Array<{
        month: Date;
        median: number | null;
        listing_count: number;
      }>
    >(Prisma.sql`
      SELECT
        DISTINCT ON (date_trunc('month', "snapshotDate"))
        date_trunc('month', "snapshotDate")::date AS month,
        "medianPricePerSqft"::float8 AS median,
        "listingCount" AS listing_count
      FROM "locality_snapshots"
      WHERE "neighborhoodId" = ${neighborhoodId}::uuid
        AND "snapshotDate" >= ${from}::date
      ORDER BY date_trunc('month', "snapshotDate") ASC, "snapshotDate" DESC
    `);

    return rows.map((row) => ({
      month: row.month.toISOString().slice(0, 7),
      medianPricePerSqft: row.median === null ? null : Math.round(row.median * 100) / 100,
      listingCount: Number(row.listing_count),
    }));
  }

  // -------------------------------------------------------------------------
  // Insights Dashboard (Feature 10) — homepage-widget aggregations
  // -------------------------------------------------------------------------

  /**
   * City-level rollup for the Property Price Insights widget.
   *
   * All figures computed live from current listings and projects, not from
   * snapshots — the homepage widget should never surface stale numbers
   * because the nightly job hasn't run yet on day 1.
   */
  async getCitySummary(city: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        listing_count: bigint;
        median: number | null;
        avg_dom: number | null;
        min_price: number | null;
        max_price: number | null;
      }>
    >(Prisma.sql`
      SELECT
        COUNT(*) AS listing_count,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY (l."price" / NULLIF(p."areaSqft", 0))
        )::float8 AS median,
        AVG(
          EXTRACT(EPOCH FROM (COALESCE(l."soldAt", NOW()) - l."firstListedAt")) / 86400
        )::int AS avg_dom,
        MIN(l."price")::float8 AS min_price,
        MAX(l."price")::float8 AS max_price
      FROM "listings" l
      JOIN "properties" p ON p."id" = l."propertyId"
      JOIN "neighborhoods" n ON n."id" = p."neighborhoodId"
      WHERE l."status" = 'APPROVED'::"ListingStatus"
        AND l."isVerified" = true
        AND p."areaSqft" > 0
        AND n."city" ILIKE ${city}
    `);

    const [projectCount, soldCount] = await Promise.all([
      this.prisma.project.count({
        where: {
          status: 'APPROVED',
          isVerified: true,
          neighborhood: { city: { equals: city, mode: 'insensitive' } },
        },
      }),
      this.prisma.listing.count({
        where: {
          status: 'SOLD',
          property: {
            neighborhood: { city: { equals: city, mode: 'insensitive' } },
          },
        },
      }),
    ]);

    const row = rows[0];
    const listingCount = row ? Number(row.listing_count) : 0;
    const median =
      row && row.median !== null && listingCount >= MIN_MEDIAN_SAMPLE
        ? Math.round(row.median)
        : null;

    return {
      city,
      listingCount,
      medianPricePerSqft: median,
      avgDaysOnMarket: row?.avg_dom ?? null,
      projectCount,
      soldCount,
      priceRange: {
        min: row?.min_price ? Math.round(row.min_price) : null,
        max: row?.max_price ? Math.round(row.max_price) : null,
      },
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Price-per-sqft distribution histogram — matches the Square Yards
   * homepage buckets. Fixed bins deliberately: the buckets themselves
   * are a signal ("Hyderabad clusters at ₹7-10k/sqft"), not a chart
   * parameter to tune.
   */
  async getPriceDistribution(city: string) {
    // Bucket boundaries in ₹/sqft. Chosen to match the Hyderabad market:
    // most inventory lives between 4k and 15k, so the granular buckets
    // are there; the wider buckets at the extremes catch the tails
    // without inflating them visually.
    const rows = await this.prisma.$queryRaw<
      Array<{
        bucket: string;
        count: bigint;
      }>
    >(Prisma.sql`
      SELECT bucket, COUNT(*) AS count FROM (
        SELECT
          CASE
            WHEN pps < 4000  THEN '0-4K'
            WHEN pps < 6000  THEN '4-6K'
            WHEN pps < 8000  THEN '6-8K'
            WHEN pps < 10000 THEN '8-10K'
            WHEN pps < 12000 THEN '10-12K'
            WHEN pps < 15000 THEN '12-15K'
            WHEN pps < 20000 THEN '15-20K'
            ELSE '20K+'
          END AS bucket
        FROM (
          SELECT (l."price" / NULLIF(p."areaSqft", 0))::float8 AS pps
          FROM "listings" l
          JOIN "properties" p ON p."id" = l."propertyId"
          JOIN "neighborhoods" n ON n."id" = p."neighborhoodId"
          WHERE l."status" = 'APPROVED'::"ListingStatus"
            AND l."isVerified" = true
            AND p."areaSqft" > 0
            AND n."city" ILIKE ${city}
        ) prices
        WHERE pps IS NOT NULL AND pps > 0
      ) bucketed
      GROUP BY bucket
    `);

    // Preserve fixed bucket order for a chart with stable X-axis rendering.
    const BUCKET_ORDER = [
      '0-4K',
      '4-6K',
      '6-8K',
      '8-10K',
      '10-12K',
      '12-15K',
      '15-20K',
      '20K+',
    ];
    const counts = new Map(rows.map((r) => [r.bucket, Number(r.count)]));
    return {
      city,
      buckets: BUCKET_ORDER.map((label) => ({
        label,
        count: counts.get(label) ?? 0,
      })),
      total: Array.from(counts.values()).reduce((a, b) => a + b, 0),
    };
  }

  /**
   * City-wide price trend — average of all locality snapshots per month
   * over the requested window. Weighted by listing count so a busy
   * locality's swing doesn't get drowned by a thin one's.
   */
  async getCityTrend(city: string, months: number) {
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    from.setHours(0, 0, 0, 0);

    const rows = await this.prisma.$queryRaw<
      Array<{
        month: Date;
        weighted_median: number | null;
        total_listings: number;
      }>
    >(Prisma.sql`
      SELECT
        date_trunc('month', s."snapshotDate")::date AS month,
        (SUM(s."medianPricePerSqft" * s."listingCount") / NULLIF(SUM(s."listingCount"), 0))::float8 AS weighted_median,
        SUM(s."listingCount")::int AS total_listings
      FROM "locality_snapshots" s
      JOIN "neighborhoods" n ON n."id" = s."neighborhoodId"
      WHERE n."city" ILIKE ${city}
        AND s."snapshotDate" >= ${from}::date
        AND s."medianPricePerSqft" IS NOT NULL
      GROUP BY date_trunc('month', s."snapshotDate")
      ORDER BY month ASC
    `);

    return {
      city,
      months,
      points: rows.map((row) => ({
        month: row.month.toISOString().slice(0, 7),
        medianPricePerSqft:
          row.weighted_median === null ? null : Math.round(row.weighted_median),
        listingCount: Number(row.total_listings),
      })),
    };
  }
}
