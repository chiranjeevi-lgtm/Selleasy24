/**
 * Typed client for the SellEasy24 API.
 *
 * Types are declared here rather than imported from the API package: the web app
 * consumes the HTTP contract, not the server's internals. If the two drift, the
 * fix is to regenerate from the OpenAPI document the API already publishes —
 * not to reach across into server code.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ListingPhoto {
  id: string;
  url: string;
  sortOrder: number;
}

export interface ListingCard {
  id: string;
  title: string;
  price: number;
  pricePerSqft: number | null;
  isVerified: boolean;
  verifiedAt: string | null;
  firstListedAt: string | null;
  lastConfirmedAt: string | null;
  property: {
    address: string;
    pincode: string;
    propertyType: string;
    bedrooms: number;
    bathrooms: number;
    areaSqft: number;
    yearBuilt: number | null;
    locality: string;
    city: string;
  };
  photos: ListingPhoto[];
  listedBy: { name: string; kind: string | null };
}

export interface LocalityBenchmark {
  medianPricePerSqft: number | null;
  sampleSize: number;
  differencePercent: number | null;
}

export interface PriceHistoryEntry {
  price: number;
  previousPrice: number | null;
  changedAt: string;
}

export interface ListingDetail extends ListingCard {
  description: string;
  priceNegotiable: boolean;
  contactPreference: string;
  localityBenchmark: LocalityBenchmark;
  priceHistory: PriceHistoryEntry[];
  /**
   * The structured field set. Present only on the detail response — search
   * results carry the lean projection, so these are absent on a ListingCard.
   */
  property: ListingCard['property'] & {
    carpetAreaSqft: number | null;
    balconies: number | null;
    floor: number | null;
    totalFloors: number | null;
    possession: string;
    furnishing: string | null;
    facing: string | null;
    coveredParking: number | null;
    openParking: number | null;
    ownership: string | null;
    approvingAuthority: string | null;
    amenities: string[];
  };
}

/**
 * Comparison payload.
 *
 * Items carry the same structured property block as the detail response, so the
 * comparison table and the detail page cannot disagree about a property.
 */
export interface CompareResult {
  items: Array<
    ListingCard & {
      description: string;
      property: ListingDetail['property'];
    }
  >;
  /** Requested ids that are no longer publicly visible. */
  unavailable: string[];
}

export interface VerificationCheck {
  kind: string;
  label: string;
  passed: boolean;
  note: string | null;
}

export interface VerificationRecord {
  listingId: string;
  verifiedAt: string;
  firstListedAt: string | null;
  lastConfirmedAt: string | null;
  checks: VerificationCheck[];
}

export interface Locality {
  id: string;
  name: string;
  city: string;
  state: string;
  pincode: string;
  medianPricePerSqft: string | number | null;
  medianSampleSize: number | null;
}

export interface SearchResult {
  total: number;
  limit: number;
  offset: number;
  items: ListingCard[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly reference?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    // Listing data changes when a verifier acts, so it is never statically
    // cached. Freshness is the product.
    cache: 'no-store',
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let reference: string | undefined;
    try {
      const body = (await response.json()) as { message?: string; reference?: string };
      if (body.message) {
        message = body.message;
      }
      reference = body.reference;
    } catch {
      // Non-JSON error body; the status-derived message stands.
    }
    throw new ApiError(response.status, message, reference);
  }

  return (await response.json()) as T;
}

export interface SearchParams {
  q?: string;
  city?: string;
  neighborhoodId?: string;
  /** Comma-separated; the API matches any of them. */
  propertyType?: string;
  /** Comma-separated exact counts, e.g. "2,3". */
  bedrooms?: string;
  minBedrooms?: string;
  minPrice?: string;
  maxPrice?: string;
  ownersOnly?: string;
  // Structured filters. Strings because they come straight off the URL.
  possession?: string;
  furnishing?: string;
  facing?: string;
  ownership?: string;
  approvingAuthority?: string;
  /** Comma-separated; the API combines them with AND. */
  amenities?: string;
  minFloor?: string;
  maxFloor?: string;
  maxAgeYears?: string;
  sort?: string;
  limit?: string;
  offset?: string;
}

export const api = {
  searchListings(params: SearchParams): Promise<SearchResult> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        query.set(key, value);
      }
    }
    return request<SearchResult>(`/listings/search?${query.toString()}`);
  },

  listing(id: string): Promise<ListingDetail> {
    return request<ListingDetail>(`/listings/${id}`);
  },

  /** Side-by-side data for 2–4 listings. Records no views. */
  compareListings(ids: string[]): Promise<CompareResult> {
    const query = new URLSearchParams({ ids: ids.join(',') });
    return request<CompareResult>(`/listings/compare?${query.toString()}`);
  },

  /**
   * The verification record — public, no login.
   *
   * Returns null when a listing has no published record rather than throwing,
   * so a detail page renders without it instead of failing outright.
   */
  async verification(id: string): Promise<VerificationRecord | null> {
    try {
      return await request<VerificationRecord>(`/verification/public/${id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  },

  localities(city = 'Hyderabad'): Promise<Locality[]> {
    return request<Locality[]>(`/localities?city=${encodeURIComponent(city)}`);
  },

  submitEnquiry(
    listingId: string,
    payload: { name: string; phone: string; email?: string; message?: string },
  ): Promise<{ id: string; submitted: true }> {
    return request(`/listings/${listingId}/enquiries`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  reportListing(
    listingId: string,
    payload: { reason: string; details?: string },
  ): Promise<{ id: string; status: string }> {
    return request(`/listings/${listingId}/reports`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
