/**
 * Approximate centroids for the localities the site actively serves.
 *
 * Hand-curated rather than reverse-geocoded, because a stable list of a few
 * dozen well-known areas is fine for a locality-scale map — precise per-listing
 * pins wait for the backend to populate `Property.latitude` / `longitude`
 * (columns already exist in schema.prisma, see the "map search is Phase 2"
 * comment).
 *
 * Matched to `Locality.name` case-insensitively.
 */
export interface KnownLocality {
  name: string;
  lat: number;
  lng: number;
}

export const HYDERABAD_CENTRE = { lat: 17.4065, lng: 78.4772 } as const;

export const KNOWN_LOCALITIES: KnownLocality[] = [
  { name: 'Gachibowli', lat: 17.4401, lng: 78.3489 },
  { name: 'Kondapur', lat: 17.4636, lng: 78.3639 },
  { name: 'Madhapur', lat: 17.4483, lng: 78.3915 },
  { name: 'Hitech City', lat: 17.4453, lng: 78.3762 },
  { name: 'Kokapet', lat: 17.4184, lng: 78.3273 },
  { name: 'Narsingi', lat: 17.4023, lng: 78.3477 },
  { name: 'Manikonda', lat: 17.4033, lng: 78.3800 },
  { name: 'Financial District', lat: 17.4147, lng: 78.3416 },
  { name: 'Jubilee Hills', lat: 17.4325, lng: 78.4071 },
  { name: 'Banjara Hills', lat: 17.4126, lng: 78.4325 },
  { name: 'Begumpet', lat: 17.4437, lng: 78.4691 },
  { name: 'Ameerpet', lat: 17.4374, lng: 78.4487 },
  { name: 'Kukatpally', lat: 17.4849, lng: 78.4138 },
  { name: 'Miyapur', lat: 17.4953, lng: 78.3717 },
  { name: 'Nizampet', lat: 17.5109, lng: 78.3921 },
  { name: 'Bachupally', lat: 17.5350, lng: 78.3730 },
  { name: 'Uppal', lat: 17.4058, lng: 78.5591 },
  { name: 'Nagole', lat: 17.3812, lng: 78.5591 },
  { name: 'LB Nagar', lat: 17.3468, lng: 78.5548 },
  { name: 'Kompally', lat: 17.5445, lng: 78.4864 },
  { name: 'Attapur', lat: 17.3789, lng: 78.4213 },
  { name: 'Tellapur', lat: 17.4805, lng: 78.2892 },
  { name: 'Nallagandla', lat: 17.4700, lng: 78.3163 },
  { name: 'Puppalguda', lat: 17.3910, lng: 78.3603 },
  { name: 'Shaikpet', lat: 17.4062, lng: 78.4008 },
  { name: 'Alwal', lat: 17.5010, lng: 78.5049 },
  { name: 'Secunderabad', lat: 17.4399, lng: 78.4983 },
];

export function findKnownLocality(name: string): KnownLocality | undefined {
  const needle = name.trim().toLowerCase();
  return KNOWN_LOCALITIES.find((locality) => locality.name.toLowerCase() === needle);
}

/**
 * URL slug for a locality: lowercase, hyphenated, `-hyderabad` suffix.
 *
 * The city suffix is deliberate. It leaves room for multi-city expansion
 * without breaking existing URLs, and it matches Square Yards' convention
 * so the SEO surface reads as a legitimate locality guide rather than a
 * stripped-down microsite.
 */
export function localitySlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base}-hyderabad`;
}

export function findLocalityBySlug(slug: string): KnownLocality | undefined {
  return KNOWN_LOCALITIES.find((locality) => localitySlug(locality.name) === slug);
}

/** Haversine distance in kilometres. */
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

/** Nearest known locality to a point, or undefined if none within `maxKm`. */
export function nearestLocality(
  point: { lat: number; lng: number },
  maxKm = 60,
): { locality: KnownLocality; km: number } | undefined {
  let best: { locality: KnownLocality; km: number } | undefined;
  for (const locality of KNOWN_LOCALITIES) {
    const km = distanceKm(point, locality);
    if (km > maxKm) continue;
    if (!best || km < best.km) {
      best = { locality, km };
    }
  }
  return best;
}
