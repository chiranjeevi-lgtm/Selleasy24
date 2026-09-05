/**
 * Hyderabad landmarks used for the infrastructure-proximity component of
 * the investment score.
 *
 * Hand-curated rather than pulled from OSM at query time — this list
 * changes on the order of years (new metro lines, new ORR exits), and a
 * dynamic pull would add a runtime dependency for no accuracy gain. When
 * Phase 7's expansion adds new metro stations or a second airport, this
 * file is the one place to edit.
 *
 * Coordinates are approximate (station centroids, ORR entry-point midpoints).
 * The scoring function uses only "distance to nearest of any category" so
 * ±100m does not shift a score.
 */

export interface Landmark {
  name: string;
  kind: 'metro' | 'orr' | 'airport' | 'business_district';
  lat: number;
  lng: number;
}

export const HYDERABAD_LANDMARKS: Landmark[] = [
  // Metro — Blue Line (west corridor)
  { name: 'Nagole Metro', kind: 'metro', lat: 17.3812, lng: 78.5591 },
  { name: 'Uppal Metro', kind: 'metro', lat: 17.4058, lng: 78.5591 },
  { name: 'Habsiguda Metro', kind: 'metro', lat: 17.4038, lng: 78.5478 },
  { name: 'Ameerpet Metro', kind: 'metro', lat: 17.4374, lng: 78.4487 },
  { name: 'S.R. Nagar Metro', kind: 'metro', lat: 17.4404, lng: 78.4423 },
  { name: 'Erragadda Metro', kind: 'metro', lat: 17.4517, lng: 78.4308 },
  { name: 'Kukatpally Metro', kind: 'metro', lat: 17.4849, lng: 78.4138 },
  { name: 'Miyapur Metro', kind: 'metro', lat: 17.4953, lng: 78.3717 },
  { name: 'Hitech City Metro', kind: 'metro', lat: 17.4453, lng: 78.3762 },
  { name: 'Raidurg Metro', kind: 'metro', lat: 17.4370, lng: 78.3877 },
  { name: 'Madhapur Metro', kind: 'metro', lat: 17.4483, lng: 78.3915 },
  { name: 'Durgam Cheruvu Metro', kind: 'metro', lat: 17.4306, lng: 78.3946 },

  // Metro — Green Line (north-south)
  { name: 'MG Bus Station Metro', kind: 'metro', lat: 17.3803, lng: 78.4864 },
  { name: 'Secunderabad East Metro', kind: 'metro', lat: 17.4353, lng: 78.5027 },

  // Metro — Red Line
  { name: 'LB Nagar Metro', kind: 'metro', lat: 17.3468, lng: 78.5548 },
  { name: 'Dilsukhnagar Metro', kind: 'metro', lat: 17.3688, lng: 78.5247 },

  // ORR entry/exit points
  { name: 'ORR Gachibowli', kind: 'orr', lat: 17.4401, lng: 78.3489 },
  { name: 'ORR Kollur', kind: 'orr', lat: 17.4855, lng: 78.2795 },
  { name: 'ORR Tellapur', kind: 'orr', lat: 17.4805, lng: 78.2892 },
  { name: 'ORR Narsingi', kind: 'orr', lat: 17.4023, lng: 78.3477 },
  { name: 'ORR Kokapet', kind: 'orr', lat: 17.4184, lng: 78.3273 },
  { name: 'ORR Kompally', kind: 'orr', lat: 17.5445, lng: 78.4864 },
  { name: 'ORR Ghatkesar', kind: 'orr', lat: 17.4425, lng: 78.6787 },

  // Airport
  { name: 'Rajiv Gandhi Intl Airport', kind: 'airport', lat: 17.2403, lng: 78.4294 },

  // Major business districts — walkable-to-office is a real value driver
  { name: 'HITEC City', kind: 'business_district', lat: 17.4453, lng: 78.3762 },
  { name: 'Financial District', kind: 'business_district', lat: 17.4147, lng: 78.3416 },
  { name: 'Gachibowli Business', kind: 'business_district', lat: 17.4401, lng: 78.3489 },
];

/** Haversine distance in kilometres between two lat/lng points. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Nearest landmark of any kind to the given point. Returns null when the
 * point is beyond a reasonable Hyderabad radius (~80 km catches Shamshabad
 * plus buffer) — a "nearest metro is 200km away" answer is meaningless.
 */
export function nearestLandmarkKm(
  point: { lat: number; lng: number },
): { landmark: Landmark; km: number } | null {
  let best: { landmark: Landmark; km: number } | null = null;
  for (const landmark of HYDERABAD_LANDMARKS) {
    const km = distanceKm(point, landmark);
    if (km > 80) continue;
    if (!best || km < best.km) best = { landmark, km };
  }
  return best;
}
