import { z } from 'zod';

/**
 * Time-series query — how many months of history to fetch.
 *
 * Bounded at 60 months (5 years) so a single request can support the
 * longest trend window we surface on locality pages without pulling
 * unbounded history.
 */
export const seriesQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(60).default(12),
});

export type SeriesQueryDto = z.infer<typeof seriesQuerySchema>;

/**
 * City-level insight queries — the Property Price Insights widget on the
 * homepage consumes these. City is required rather than defaulted so a
 * caller cannot silently ask about the wrong market once the platform
 * expands beyond Hyderabad.
 */
export const insightsQuerySchema = z.object({
  city: z.string().trim().min(2).max(60),
});

export type InsightsQueryDto = z.infer<typeof insightsQuerySchema>;

/**
 * Price-distribution histogram query.
 *
 * Buckets are fixed rather than caller-supplied — a homepage chart with
 * user-configurable bucket boundaries is a debugging tool, not a product.
 */
export const priceDistributionQuerySchema = z.object({
  city: z.string().trim().min(2).max(60),
});

export type PriceDistributionQueryDto = z.infer<typeof priceDistributionQuerySchema>;
