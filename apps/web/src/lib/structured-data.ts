/**
 * JSON-LD structured data helpers.
 *
 * Emitted as a `<script type="application/ld+json">` tag in the page head
 * (or body — Google's crawler accepts either). Two roles:
 *
 *   1. Rich-result eligibility on Google — price, address, images can show
 *      directly in the SERP for RealEstateListing.
 *   2. Machine-readable claim that a home is verified — the "verified 4h ago
 *      by officer #V-023" line becomes an `Offer.eligibilityCriteria` string
 *      instead of only sitting in the visual pill, so agents and aggregators
 *      that consume LD-JSON pick it up.
 *
 * Everything here is a pure builder. Serialisation happens in the caller
 * component so a test can assert the shape without a DOM.
 */

import type { ListingDetail } from './api';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://selleasy24.com';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Convert a listing photo path to an absolute URL — schema.org requires
 * absolute image URLs, relative paths get silently dropped by Google's
 * validator.
 */
function absoluteImage(url: string): string {
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

/**
 * RealEstateListing JSON-LD for a listing detail page.
 *
 * The eligibilityCriteria carries our verification-recency claim in a form
 * external consumers can parse — the visual pill in the UI, but as data.
 */
export function realEstateListingLd(listing: ListingDetail): Record<string, unknown> {
  const url = `${SITE_URL}/listings/${listing.id}`;

  const image = listing.photos
    .slice(0, 6) // Google recommends up to ~6 for a rich result.
    .map((p) => absoluteImage(p.url));

  const verificationClaim =
    listing.isVerified && listing.verifiedByOfficer
      ? `Verified by SellEasy24 officer ${listing.verifiedByOfficer}${
          listing.verifiedAt ? ` on ${new Date(listing.verifiedAt).toISOString()}` : ''
        }`
      : listing.isVerified
        ? 'Verified by SellEasy24'
        : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    '@id': url,
    url,
    name: listing.title,
    description: listing.description.slice(0, 500),
    ...(image.length > 0 && { image }),
    datePosted: listing.firstListedAt,
    numberOfRooms: listing.property.bedrooms,
    floorSize: {
      '@type': 'QuantitativeValue',
      value: listing.property.areaSqft,
      unitCode: 'FTK', // UN/CEFACT code for square foot.
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: listing.property.address,
      addressLocality: listing.property.locality,
      addressRegion: 'Telangana',
      addressCountry: 'IN',
      ...(listing.property.pincode && { postalCode: listing.property.pincode }),
    },
    offers: {
      '@type': 'Offer',
      price: listing.price,
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      url,
      ...(verificationClaim && { eligibilityCriteria: verificationClaim }),
    },
  };
}

/**
 * Place JSON-LD for a locality overview page.
 *
 * `Place` (not `Neighborhood` — that isn't in schema.org) with a
 * `containedInPlace` reference to Hyderabad, so a crawler linking places
 * together can build the parent/child relationship.
 */
export function localityPlaceLd(
  locality: { name: string; lat?: number; lng?: number },
  editorial?: { positioning?: string | undefined },
): Record<string, unknown> {
  const slug = locality.name.toLowerCase().replace(/\s+/g, '-');
  const url = `${SITE_URL}/localities/${slug}-hyderabad`;

  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    '@id': url,
    url,
    name: `${locality.name}, Hyderabad`,
    ...(editorial?.positioning && {
      description: editorial.positioning.slice(0, 300),
    }),
    ...(locality.lat !== undefined &&
      locality.lng !== undefined && {
        geo: {
          '@type': 'GeoCoordinates',
          latitude: locality.lat,
          longitude: locality.lng,
        },
      }),
    containedInPlace: {
      '@type': 'City',
      name: 'Hyderabad',
      address: {
        '@type': 'PostalAddress',
        addressRegion: 'Telangana',
        addressCountry: 'IN',
      },
    },
  };
}

/**
 * Homepage / global LocalBusiness JSON-LD — attaches the SellEasy24 brand
 * itself to a knowledge-panel worthy entity so brand searches ("selleasy24
 * hyderabad") can surface with logo, description, contact.
 */
export function siteLocalBusinessLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    '@id': SITE_URL,
    url: SITE_URL,
    name: 'SellEasy24',
    description:
      'Verified residential home listings in Hyderabad — every seller checked against ownership documents before the listing goes live.',
    areaServed: {
      '@type': 'City',
      name: 'Hyderabad',
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Hyderabad',
      addressRegion: 'Telangana',
      addressCountry: 'IN',
    },
  };
}

/**
 * React component that emits a `<script type="application/ld+json">` tag
 * with the given data. Placed once per page — Google reads all of them,
 * but duplication is a validator warning.
 *
 * `dangerouslySetInnerHTML` is the standard Next.js pattern here; the
 * payload is server-built from typed data (no user input flows in), so the
 * injection surface is bounded.
 */
export function jsonLdScript(data: Record<string, unknown>): string {
  // Escape `<` to defeat a `</script>` closing-tag injection — the only real
  // vector when the payload is otherwise built from typed server data.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
