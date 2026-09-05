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
  /**
   * Public officer ID of the verifier (e.g. "V-001"). Null if unverified
   * or if verified by a legacy account without a public ID assigned.
   * Rendered next to the recency label on cards.
   */
  verifiedByOfficer: string | null;
  firstListedAt: string | null;
  lastConfirmedAt: string | null;
  // --- Rent parity ---
  kind: 'SALE' | 'RENT';
  monthlyRent: number | null;
  depositMonths: number | null;
  tenantPreference: 'ANY' | 'FAMILY' | 'BACHELOR_MALE' | 'BACHELOR_FEMALE' | 'COMPANY' | null;
  petsAllowed: boolean | null;
  availableFrom: string | null;
  leaseDurationMonths: number | null;
  zeroBrokerage: boolean;
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

// ---------------------------------------------------------------------------
// Builder projects
// ---------------------------------------------------------------------------

export type ProjectStage =
  | 'PRE_LAUNCH'
  | 'UNDER_CONSTRUCTION'
  | 'NEARING_POSSESSION'
  | 'READY_TO_MOVE'
  | 'DELIVERED';

export interface ProjectCard {
  id: string;
  name: string;
  stage: ProjectStage;
  address: string;
  pincode: string;
  locality: string;
  city: string;
  possessionDate: string | null;
  deliveredOn: string | null;
  reraNumber: string;
  isVerified: boolean;
  firstListedAt: string | null;
  verifiedAt: string | null;
  totalTowers: number | null;
  totalUnits: number | null;
  /** Derived from the units, so nothing has to be kept in sync. */
  priceFrom: number | null;
  priceTo: number | null;
  bedrooms: number[];
  builder: { id: string; name: string; reraNumber: string | null };
  photos: Array<{ id: string; url: string; isRender: boolean }>;
}

export interface ProjectUnit {
  id: string;
  bedrooms: number;
  bathrooms: number;
  balconies: number | null;
  areaSqft: number;
  carpetAreaSqft: number | null;
  /** A starting figure, not an asking price. Never render it without "from". */
  priceFrom: number;
  totalUnits: number | null;
  availableUnits: number | null;
  floorPlanUrl: string | null;
}

export interface ProjectDetail extends ProjectCard {
  description: string;
  landAreaAcres: number | null;
  approvingAuthority: string | null;
  amenities: string[];
  units: ProjectUnit[];
}

export interface ProjectSearchResult {
  total: number;
  limit: number;
  offset: number;
  items: ProjectCard[];
}

export interface ProjectVerificationRecord {
  projectId: string;
  reraNumber: string;
  verifiedAt: string;
  firstListedAt: string | null;
  checks: VerificationCheck[];
}

export interface ProjectSearchParams {
  stage?: string;
  locality?: string;
  bedrooms?: string;
  minPrice?: string;
  maxPrice?: string;
  limit?: string;
  offset?: string;
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
  // --- Rent parity ---
  kind?: 'SALE' | 'RENT';
  minRent?: string;
  maxRent?: string;
  maxDepositMonths?: string;
  tenantPreference?: string;
  petsAllowed?: string;
  zeroBrokerage?: string;
  /** ISO date. */
  availableFrom?: string;
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

  // --- New construction ---

  searchProjects(params: ProjectSearchParams): Promise<ProjectSearchResult> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        query.set(key, value);
      }
    }
    return request<ProjectSearchResult>(`/projects/search?${query.toString()}`);
  },

  project(id: string): Promise<ProjectDetail> {
    return request<ProjectDetail>(`/projects/${id}`);
  },

  /** Null when a project has no published record, so the page renders without it. */
  async projectVerification(id: string): Promise<ProjectVerificationRecord | null> {
    try {
      return await request<ProjectVerificationRecord>(`/verification/projects/public/${id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
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

  // ---------------------------------------------------------------------------
  // Phase 2 additions — analytics, valuations, scoring, reviews, regulatory
  // ---------------------------------------------------------------------------

  /** Latest analytics snapshot + 1yr/3yr/5yr appreciation for a locality. */
  localityAnalytics(neighborhoodId: string): Promise<LocalityAnalyticsResponse> {
    return request<LocalityAnalyticsResponse>(
      `/localities/${neighborhoodId}/analytics`,
    );
  },

  /** Monthly price-trend series for a locality (downsampled to one point per month). */
  localityAnalyticsSeries(
    neighborhoodId: string,
    months = 12,
  ): Promise<LocalityAnalyticsSeries> {
    return request<LocalityAnalyticsSeries>(
      `/localities/${neighborhoodId}/analytics/series?months=${months}`,
    );
  },

  /** City-level rollup for the homepage Insights Dashboard. */
  citySummary(city: string): Promise<CitySummary> {
    return request<CitySummary>(
      `/analytics/insights/city-summary?city=${encodeURIComponent(city)}`,
    );
  },

  /** Histogram of listings bucketed by ₹/sqft. */
  cityPriceDistribution(city: string): Promise<CityPriceDistribution> {
    return request<CityPriceDistribution>(
      `/analytics/insights/price-distribution?city=${encodeURIComponent(city)}`,
    );
  },

  /** City-wide weighted median price trend. */
  cityTrend(city: string, months = 12): Promise<CityTrend> {
    return request<CityTrend>(
      `/analytics/insights/city-trend?city=${encodeURIComponent(city)}&months=${months}`,
    );
  },

  /** Public list of approved locality reviews + rating summary. */
  localityReviews(
    neighborhoodId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<LocalityReviewsResponse> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const qs = params.toString();
    return request<LocalityReviewsResponse>(
      `/localities/${neighborhoodId}/reviews${qs ? `?${qs}` : ''}`,
    );
  },

  /** Investment score + breakdown for a listing. */
  listingInvestmentScore(listingId: string): Promise<InvestmentScoreResponse> {
    return request<InvestmentScoreResponse>(
      `/listings/${listingId}/investment-score`,
    );
  },

  /** Investment score + breakdown for a project. */
  projectInvestmentScore(projectId: string): Promise<InvestmentScoreResponse> {
    return request<InvestmentScoreResponse>(
      `/projects/${projectId}/investment-score`,
    );
  },

  /** RERA / regulatory registration lookup by number. Never throws 404 — status is NOT_FOUND. */
  reraCheck(registrationNumber: string): Promise<RegulatoryCheckResult> {
    return request<RegulatoryCheckResult>(
      `/regulatory/rera/${encodeURIComponent(registrationNumber)}`,
    );
  },

  /** Estimate a property value from comparables. */
  estimateValuation(payload: ValuationEstimateInput): Promise<ValuationResult> {
    return request<ValuationResult>('/valuations/estimate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Public directory of active field agents. */
  listFieldAgents(): Promise<{ items: FieldAgentDirectoryEntry[] }> {
    return request<{ items: FieldAgentDirectoryEntry[] }>('/field-agents');
  },
};

// ---------------------------------------------------------------------------
// Phase 2 response types
// ---------------------------------------------------------------------------

export interface LocalityAnalyticsResponse {
  locality: { id: string; name: string; city: string };
  latest: {
    snapshotDate: string;
    medianPricePerSqft: number | null;
    listingCount: number;
    sampleSize: number;
    avgDaysOnMarket: number | null;
  } | null;
  appreciation: {
    '1yr': number | null;
    '3yr': number | null;
    '5yr': number | null;
  };
}

export interface LocalityAnalyticsSeries {
  months: number;
  points: Array<{
    month: string;
    medianPricePerSqft: number | null;
    listingCount: number;
  }>;
}

export interface CitySummary {
  city: string;
  listingCount: number;
  medianPricePerSqft: number | null;
  avgDaysOnMarket: number | null;
  projectCount: number;
  soldCount: number;
  priceRange: { min: number | null; max: number | null };
  computedAt: string;
}

export interface CityPriceDistribution {
  city: string;
  buckets: Array<{ label: string; count: number }>;
  total: number;
}

export interface CityTrend {
  city: string;
  months: number;
  points: Array<{
    month: string;
    medianPricePerSqft: number | null;
    listingCount: number;
  }>;
}

export interface LocalityReview {
  id: string;
  rating: number;
  pros: string;
  cons: string;
  tenureYears: number | null;
  createdAt: string;
  authorFirstName: string;
}

export interface LocalityReviewsResponse {
  total: number;
  limit: number;
  offset: number;
  summary: {
    averageRating: number | null;
    totalCount: number;
    distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  };
  items: LocalityReview[];
}

export interface InvestmentScoreComponent {
  label: string;
  score: number;
  max: number;
  rationale: string;
}

export interface InvestmentScoreResponse {
  score: number;
  computedAt: string;
  components: InvestmentScoreComponent[];
}

export interface RegulatoryCheckResult {
  found: boolean;
  authority: 'TSRERA' | 'HMDA' | 'GHMC' | null;
  registrationNumber: string;
  status:
    | 'ACTIVE'
    | 'EXPIRED'
    | 'REVOKED'
    | 'UNDER_REVIEW'
    | 'NOT_FOUND';
  projectName: string | null;
  promoterName: string | null;
  registeredOn: string | null;
  expiresOn: string | null;
  isCurrent: boolean;
  syncedAt: string | null;
}

export interface ValuationEstimateInput {
  latitude?: number;
  longitude?: number;
  neighborhoodId?: string;
  propertyType: string;
  bedrooms: number;
  areaSqft: number;
  radiusKm?: number;
}

export interface ValuationResult {
  estimatedLow: number;
  estimatedMid: number;
  estimatedHigh: number;
  perSqft: { low: number; mid: number; high: number };
  comparableCount: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  method: 'radius_config_match' | 'locality_median' | 'insufficient_data';
  comparables: Array<{
    distanceKm: number | null;
    bedrooms: number;
    areaSqft: number;
    pricePerSqft: number;
    firstListedAt: string | null;
  }>;
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Field agent — application + directory
// ---------------------------------------------------------------------------

export interface FieldAgentApplicationInput {
  fullName: string;
  phone: string;
  email: string;
  /**
   * Sets up the applicant's account so they can sign back in to check
   * status. The apply endpoint creates a User + FieldAgent atomically.
   */
  password: string;
  experience: 'none' | '1-2' | '3-5' | '5+';
  serviceLocalities: string[];
  notes?: string;
}

export interface FieldAgentApplicationResponse {
  fieldAgent: {
    id: string;
    status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  };
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export interface FieldAgentDirectoryEntry {
  id: string;
  fullName: string;
  serviceLocalities: string[];
  ratingAverage: number | null;
  ratingCount: number;
  completedAssignments: number;
  activatedAt: string | null;
}
