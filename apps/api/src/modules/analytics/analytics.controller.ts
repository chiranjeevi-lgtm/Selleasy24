import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@kamala/db';

import { Public, Roles } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AnalyticsService } from './analytics.service';
import {
  insightsQuerySchema,
  seriesQuerySchema,
  type InsightsQueryDto,
  type SeriesQueryDto,
} from './analytics.dto';

/**
 * The write side needs admin authority — snapshot recompute is a heavy
 * operation and we don't expose it to any client without ADMIN or above.
 * Read side is fully public: locality analytics are the same data buyers
 * see on the overview pages.
 */
const ANALYTICS_ADMIN_ROLES = [Role.ADMIN, Role.SUPER_ADMIN] as const;

@ApiTags('analytics')
@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  // -------------------------------------------------------------------------
  // Public reads — locality-overview page consumers
  // -------------------------------------------------------------------------

  @Get('localities/:id/analytics')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary: 'Latest analytics snapshot + yoy appreciation for a locality',
  })
  async getSummary(@Param('id', ParseUUIDPipe) neighborhoodId: string) {
    return this.analytics.getSummary(neighborhoodId);
  }

  @Get('localities/:id/analytics/series')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary: 'Monthly price-trend series over the requested window',
  })
  async getSeries(
    @Param('id', ParseUUIDPipe) neighborhoodId: string,
    @Query(new ZodValidationPipe(seriesQuerySchema)) query: SeriesQueryDto,
  ) {
    const points = await this.analytics.getSeries(neighborhoodId, query.months);
    return { months: query.months, points };
  }

  // -------------------------------------------------------------------------
  // Admin — manual recompute (nightly job wraps computeAllSnapshots)
  // -------------------------------------------------------------------------

  @Post('admin/analytics/compute/:id')
  @Roles(...ANALYTICS_ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Recompute today\'s snapshot for one locality',
    description:
      'Idempotent per locality per day thanks to the unique constraint. Use when a locality has just imported inventory and needs a fresh median before the nightly batch runs.',
  })
  async recomputeOne(@Param('id', ParseUUIDPipe) neighborhoodId: string) {
    return this.analytics.computeSnapshot(neighborhoodId);
  }

  @Post('admin/analytics/compute-all')
  @Roles(...ANALYTICS_ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Recompute today\'s snapshot for every locality',
    description:
      'Runs sequentially to avoid saturating the connection pool. Under BullMQ (Phase 2 later), this is the entry point the cron job calls.',
  })
  async recomputeAll() {
    return this.analytics.computeSnapshotsForAllLocalities();
  }

  // -------------------------------------------------------------------------
  // Insights Dashboard (Feature 10) — homepage widget aggregations
  // -------------------------------------------------------------------------

  @Get('analytics/insights/city-summary')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary: 'City-level rollup — total listings, median rate, avg DoM, projects, sold',
    description:
      'Powers the Property Price Insights widget on the homepage. Computed live rather than from snapshots so day-1 numbers are meaningful even before the nightly job has run.',
  })
  async citySummary(
    @Query(new ZodValidationPipe(insightsQuerySchema)) query: InsightsQueryDto,
  ) {
    return this.analytics.getCitySummary(query.city);
  }

  @Get('analytics/insights/price-distribution')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary: 'Histogram of listings bucketed by ₹/sqft',
    description:
      'Fixed 8 buckets sized for the Hyderabad market. Returns each bucket even when count is zero so the chart X-axis stays stable across queries.',
  })
  async priceDistribution(
    @Query(new ZodValidationPipe(insightsQuerySchema)) query: InsightsQueryDto,
  ) {
    return this.analytics.getPriceDistribution(query.city);
  }

  @Get('analytics/insights/city-trend')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary: 'City-wide price trend — weighted median ₹/sqft per month',
    description:
      'Aggregates locality snapshots across the city, weighted by listing count so a thin locality does not distort the trend line.',
  })
  async cityTrend(
    @Query(new ZodValidationPipe(insightsQuerySchema)) insights: InsightsQueryDto,
    @Query(new ZodValidationPipe(seriesQuerySchema)) series: SeriesQueryDto,
  ) {
    return this.analytics.getCityTrend(insights.city, series.months);
  }
}
