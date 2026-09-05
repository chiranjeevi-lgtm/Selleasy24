import { PropertyType } from '@kamala/db';
import { z } from 'zod';

/**
 * An e-valuation request.
 *
 * Location is one-of — either coordinates (preferred, enables PostGIS
 * radius search) or a neighborhoodId (fallback). Rejecting a request that
 * has neither is intentional: without a location anchor, there is no
 * honest way to select comparables, and returning a city-wide average
 * dressed as a "valuation" is exactly the black-box behaviour we're
 * refusing to ship (Cross-Cutting Principle #6).
 */
export const estimateSchema = z
  .object({
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    neighborhoodId: z.string().uuid().optional(),
    propertyType: z.nativeEnum(PropertyType),
    /// Exact-match on config is too restrictive; we widen by ±1 BHK
    /// inside the service. What matters here is what the buyer told us.
    bedrooms: z.coerce.number().int().min(0).max(20),
    areaSqft: z.coerce.number().int().min(100, 'Area looks too small').max(100_000),
    /// Search radius in kilometres when coordinates are supplied. Capped
    /// at 10 km — anything beyond that stops being "comparable" for the
    /// purpose of Hyderabad micro-markets.
    radiusKm: z.coerce.number().min(0.5).max(10).default(2),
  })
  .superRefine((data, ctx) => {
    const hasCoords = data.latitude !== undefined && data.longitude !== undefined;
    const hasNeighborhood = data.neighborhoodId !== undefined;
    if (!hasCoords && !hasNeighborhood) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['neighborhoodId'],
        message: 'Provide either coordinates (latitude + longitude) or a neighborhoodId',
      });
    }
    if (
      (data.latitude !== undefined && data.longitude === undefined) ||
      (data.latitude === undefined && data.longitude !== undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['longitude'],
        message: 'Both latitude and longitude are required when using coordinates',
      });
    }
  });

export type EstimateDto = z.infer<typeof estimateSchema>;
