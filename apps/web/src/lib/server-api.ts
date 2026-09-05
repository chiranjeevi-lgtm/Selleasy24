import 'server-only';

import { ApiError } from './api';
import { getAccessToken } from './session';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Authenticated API calls from server context.
 *
 * The bearer token is read from the httpOnly cookie here and never leaves the
 * server. Token refresh is handled by middleware before render, so this module
 * deliberately does not retry on 401 — a 401 at this point means the session is
 * genuinely gone, and silently retrying would mask that.
 */
async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let reference: string | undefined;
    let fieldErrors: Array<{ field: string; message: string }> | undefined;
    try {
      const body = (await response.json()) as {
        message?: string;
        reference?: string;
        errors?: Array<{ field: string; message: string }>;
      };
      if (body.message) {
        message = body.message;
      }
      reference = body.reference;
      fieldErrors = body.errors;
    } catch {
      // Non-JSON body; keep the status-derived message.
    }
    const error = new ApiError(response.status, message, reference);
    // Field-level validation detail, surfaced so forms can attach errors to inputs.
    (error as ApiError & { fieldErrors?: typeof fieldErrors }).fieldErrors = fieldErrors;
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Types mirroring the API's seller-facing responses
// ---------------------------------------------------------------------------

export interface SellerListingSummary {
  id: string;
  title: string;
  price: string;
  status: string;
  isVerified: boolean;
  firstListedAt: string | null;
  lastConfirmedAt: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  revisionNote: string | null;
  viewsCount: number;
  leadsCount: number;
  createdAt: string;
  property: {
    address: string;
    propertyType: string;
    bedrooms: number;
    areaSqft: number;
    neighborhood: { name: string; city: string };
  };
  _count: { photos: number; documents: number };
}

export interface SellerListingDetail {
  id: string;
  title: string;
  description: string;
  price: string;
  priceNegotiable: boolean;
  status: string;
  isVerified: boolean;
  rejectionReason: string | null;
  revisionNote: string | null;
  /** Only you see this. Set when the seller takes the listing down for now. */
  pausedReason: string | null;
  soldAt: string | null;
  /** Null when the seller chose not to say. Never shown to a buyer. */
  soldPrice: string | null;
  soldThroughPlatform: boolean | null;
  viewsCount: number;
  leadsCount: number;
  property: {
    id: string;
    address: string;
    pincode: string;
    propertyType: string;
    bedrooms: number;
    bathrooms: number;
    areaSqft: number;
    yearBuilt: number | null;
    neighborhood: { id: string; name: string; city: string };
  };
  photos: Array<{ id: string; url: string; sortOrder: number }>;
  documents: Array<{
    id: string;
    kind: string;
    idProofKind: string | null;
    originalFilename: string;
    sizeBytes: number;
    createdAt: string;
  }>;
  verifications: Array<{
    id: string;
    decision: string;
    reason: string | null;
    createdAt: string;
    checks: Array<{ kind: string; passed: boolean; note: string | null }>;
  }>;
}

/**
 * An enquiry, on either a resale listing or a builder project.
 *
 * Exactly one of `listing` and `project` is present — enforced by a CHECK
 * constraint in the database, not merely by convention here.
 */
export interface SellerLead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  status: string;
  contactedAt: string | null;
  createdAt: string;
  listing: { id: string; title: string } | null;
  project: { id: string; name: string } | null;
  /** Which configuration they asked about, when it was a project. */
  projectUnit: {
    id: string;
    bedrooms: number;
    areaSqft: number;
    priceFrom: string;
  } | null;
}

export interface CurrentUser {
  id: string;
  email: string;
  /** Present for accounts registered after the username field shipped; legacy accounts have null. */
  username: string | null;
  fullName: string;
  role: string;
  sellerKind: string | null;
  isEmailVerified: boolean;
  phone: string | null;
  isPhoneVerified: boolean;
}

export const serverApi = {
  me(): Promise<CurrentUser> {
    return authedRequest<CurrentUser>('/auth/me');
  },

  myStats(days = 30): Promise<SellerStats> {
    return authedRequest(`/listings/mine/stats?days=${days}`);
  },

  myListings(): Promise<SellerListingSummary[]> {
    return authedRequest<SellerListingSummary[]>('/listings/mine');
  },

  myListing(id: string): Promise<SellerListingDetail> {
    return authedRequest<SellerListingDetail>(`/listings/mine/${id}`);
  },

  createListing(payload: unknown): Promise<{ id: string }> {
    return authedRequest<{ id: string }>('/listings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  reorderPhotos(
    listingId: string,
    order: string[],
  ): Promise<Array<{ id: string; url: string; sortOrder: number }>> {
    return authedRequest(`/listings/${listingId}/photos/order`, {
      method: 'PATCH',
      body: JSON.stringify({ order }),
    });
  },

  uploadPhoto(listingId: string, form: FormData): Promise<{ id: string; url: string }> {
    return authedRequest(`/listings/${listingId}/photos`, { method: 'POST', body: form });
  },

  uploadDocument(
    listingId: string,
    kind: string,
    idProofKind: string | undefined,
    form: FormData,
  ): Promise<{ id: string; kind: string }> {
    const query = new URLSearchParams({ kind });
    if (idProofKind) {
      query.set('idProofKind', idProofKind);
    }
    return authedRequest(`/listings/${listingId}/documents?${query.toString()}`, {
      method: 'POST',
      body: form,
    });
  },

  submitListing(listingId: string): Promise<{ status: string }> {
    return authedRequest(`/listings/${listingId}/submit`, { method: 'POST' });
  },

  confirmAvailability(listingId: string): Promise<{ lastConfirmedAt: string }> {
    return authedRequest(`/listings/${listingId}/confirm-availability`, { method: 'POST' });
  },

  pauseListing(listingId: string, reason?: string): Promise<{ status: string }> {
    return authedRequest(`/listings/${listingId}/pause`, {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {}),
    });
  },

  resumeListing(listingId: string): Promise<{ status: string }> {
    return authedRequest(`/listings/${listingId}/resume`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  markListingSold(listingId: string, payload: unknown): Promise<{ status: string }> {
    return authedRequest(`/listings/${listingId}/mark-sold`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  myLeads(): Promise<SellerLead[]> {
    return authedRequest<SellerLead[]>('/leads/mine');
  },

  updateLeadStatus(leadId: string, status: string): Promise<{ id: string; status: string }> {
    return authedRequest(`/leads/${leadId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  localities(city = 'Hyderabad'): Promise<
    Array<{ id: string; name: string; city: string; pincode: string }>
  > {
    return authedRequest(`/localities?city=${encodeURIComponent(city)}`);
  },

  // --- Buyer contact ---

  sendEnquiry(listingId: string, payload: unknown): Promise<{ id: string }> {
    return authedRequest(`/listings/${listingId}/enquiries`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  sendProjectEnquiry(projectId: string, payload: unknown): Promise<{ id: string }> {
    return authedRequest(`/projects/${projectId}/enquiries`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  requestSiteVisit(listingId: string, payload: unknown): Promise<{ id: string; status: string }> {
    return authedRequest(`/listings/${listingId}/site-visits`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  receivedSiteVisits(): Promise<SiteVisit[]> {
    return authedRequest('/site-visits/received');
  },

  mySiteVisits(): Promise<SiteVisit[]> {
    return authedRequest('/site-visits/mine');
  },

  respondToSiteVisit(id: string, payload: unknown): Promise<{ id: string; status: string }> {
    return authedRequest(`/site-visits/${id}/respond`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  // --- Phone verification ---

  /**
   * `code` comes back only under the console delivery driver used for local
   * development and demonstrations. A real provider never returns it.
   */
  requestPhoneCode(phone: string): Promise<{
    channel: string;
    code?: string;
    expiresInMinutes: number;
  }> {
    return authedRequest('/auth/phone/request-code', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  verifyPhoneCode(phone: string, code: string): Promise<{ phone: string; isPhoneVerified: true }> {
    return authedRequest('/auth/phone/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
  },

  // --- Buyer preferences ---

  buyerProfile(): Promise<BuyerProfile> {
    return authedRequest('/buyers/me/profile');
  },

  // --- Saved searches ---

  mySavedSearches(): Promise<{ items: SavedSearchEntry[] }> {
    return authedRequest('/saved-searches/mine');
  },

  createSavedSearch(payload: {
    name: string;
    queryString: string;
    alertsEnabled?: boolean;
  }): Promise<SavedSearchEntry> {
    return authedRequest('/saved-searches', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  deleteSavedSearch(id: string): Promise<{ deleted: true }> {
    return authedRequest(`/saved-searches/${id}`, { method: 'DELETE' });
  },

  toggleSavedSearchAlerts(id: string, alertsEnabled: boolean): Promise<{ id: string; alertsEnabled: boolean }> {
    return authedRequest(`/saved-searches/${id}/alerts`, {
      method: 'PATCH',
      body: JSON.stringify({ alertsEnabled }),
    });
  },

  // --- Referrals ---

  myReferralCode(): Promise<{ id: string; code: string; createdAt: string }> {
    return authedRequest('/referrals/me/code', { method: 'POST' });
  },

  myReferrals(): Promise<MyReferralsResponse> {
    return authedRequest('/referrals/mine');
  },

  redeemReferral(code: string): Promise<{ id: string; code: string; status: string; createdAt: string }> {
    return authedRequest('/referrals/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  // --- Field agent ---

  myFieldAgentProfile(): Promise<MyFieldAgentProfile | null> {
    return authedRequest('/field-agents/me');
  },

  saveBuyerPurpose(payload: unknown): Promise<BuyerProfile> {
    return authedRequest('/buyers/me/profile/purpose', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  saveBuyerBudget(payload: unknown): Promise<BuyerProfile> {
    return authedRequest('/buyers/me/profile/budget', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  saveBuyerLocalities(payload: unknown): Promise<BuyerProfile> {
    return authedRequest('/buyers/me/profile/localities', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  saveBuyerAbout(payload: unknown): Promise<BuyerProfile> {
    return authedRequest('/buyers/me/profile/about', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  recommendations(limit = 12): Promise<Recommendations> {
    return authedRequest(`/buyers/me/recommendations?limit=${limit}`);
  },

  // --- Builder projects ---

  myProjects(): Promise<BuilderProjectSummary[]> {
    return authedRequest('/projects/mine');
  },

  myProject(id: string): Promise<BuilderProjectDetail> {
    return authedRequest(`/projects/mine/${id}`);
  },

  createProject(payload: unknown): Promise<{ id: string }> {
    return authedRequest('/projects', { method: 'POST', body: JSON.stringify(payload) });
  },

  setProjectUnits(id: string, units: unknown): Promise<unknown> {
    return authedRequest(`/projects/${id}/units`, {
      method: 'PUT',
      body: JSON.stringify({ units }),
    });
  },

  submitProject(id: string): Promise<{ status: string }> {
    return authedRequest(`/projects/${id}/submit`, { method: 'POST' });
  },

  uploadProjectPhoto(
    id: string,
    isRender: boolean,
    form: FormData,
  ): Promise<{ id: string; url: string; isRender: boolean }> {
    return authedRequest(`/projects/${id}/photos?isRender=${isRender}`, {
      method: 'POST',
      body: form,
    });
  },

  uploadProjectDocument(
    id: string,
    kind: string,
    form: FormData,
  ): Promise<{ id: string; kind: string }> {
    const query = new URLSearchParams({ kind });
    return authedRequest(`/projects/${id}/documents?${query.toString()}`, {
      method: 'POST',
      body: form,
    });
  },

  // --- Saved properties ---

  savedListings(): Promise<SavedList> {
    return authedRequest('/saved');
  },

  savedIds(): Promise<{ ids: string[] }> {
    return authedRequest('/saved/ids');
  },

  saveListing(listingId: string): Promise<{ saved: boolean }> {
    return authedRequest(`/listings/${listingId}/save`, { method: 'POST' });
  },

  unsaveListing(listingId: string): Promise<{ saved: boolean }> {
    return authedRequest(`/listings/${listingId}/save`, { method: 'DELETE' });
  },
};

export interface SiteVisit {
  id: string;
  status: 'REQUESTED' | 'CONFIRMED' | 'RESCHEDULED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED';
  preferredAt: string;
  proposedAt: string | null;
  confirmedAt: string | null;
  note: string | null;
  sellerNote: string | null;
  createdAt: string;
  listing: { id: string; title: string };
  /** Present on the seller's view only — this is the one place it appears. */
  buyer?: { fullName: string; phone: string | null; email: string };
}

export interface SavedSearchEntry {
  id: string;
  name: string;
  queryString: string;
  alertsEnabled: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
}

export interface MyReferralsResponse {
  items: Array<{
    id: string;
    code: string;
    status: 'PENDING' | 'QUALIFIED' | 'PAID' | 'VOIDED';
    createdAt: string;
    qualifiedAt: string | null;
    paidAt: string | null;
    referredFirstName: string;
  }>;
  counts: {
    total: number;
    pending: number;
    qualified: number;
    paid: number;
  };
  /**
   * Rupee totals across every reward this user has earned — sums over rewards
   * they received both as REFERRER (bring-in) and as REFERRED (they were the
   * new signup) so a single figure represents "how much this program has
   * earned me". Denominated in rupees, not paise, to match the display unit.
   */
  rewards: {
    pendingRupees: number;
    paidRupees: number;
  };
}

export interface MyFieldAgentProfile {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  experience: string;
  serviceLocalities: string[];
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  activatedAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  completedAssignments: number;
  createdAt: string;
}

export interface BuyerProfile {
  purpose: 'LIVE_IN' | 'RENT_OUT' | 'INVESTMENT' | null;
  householdSize: number | null;
  bedroomsWanted: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  occupation: string | null;
  /** Never shown to a seller, and not used in ranking. */
  monthlyIncome: number | null;
  /** Null means they left partway, which is not the same as answering nothing. */
  completedAt: string | null;
  localities: Array<{ id: string; name: string; city: string }>;
}

export interface Recommendation {
  id: string;
  title: string;
  price: number;
  isVerified: boolean;
  firstListedAt: string | null;
  matchScore: number;
  /** Shown to the buyer — an unexplained ranking is not worth having. */
  reasons: string[];
  property: {
    address: string;
    bedrooms: number;
    bathrooms: number;
    areaSqft: number;
    propertyType: string;
    locality: string;
    city: string;
  };
  photos: Array<{ id: string; url: string }>;
}

export interface Recommendations {
  /** False when we know nothing yet, so the caller can say so honestly. */
  personalised: boolean;
  items: Recommendation[];
}

export interface BuilderProjectSummary {
  id: string;
  name: string;
  stage: string;
  status: string;
  isVerified: boolean;
  address: string;
  possessionDate: string | null;
  deliveredOn: string | null;
  reraNumber: string;
  totalTowers: number | null;
  totalUnits: number | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  firstListedAt: string | null;
  rejectionReason: string | null;
  revisionNote: string | null;
  viewsCount: number;
  leadsCount: number;
  createdAt: string;
  neighborhood: { name: string; city: string };
  units: Array<{
    bedrooms: number;
    priceFrom: string;
    totalUnits: number | null;
    availableUnits: number | null;
  }>;
  coverUrl: string | null;
  /** Null when no configuration records availability — not the same as zero. */
  availableUnits: number | null;
  priceFrom: string | null;
  _count: { photos: number; documents: number; units: number };
}

export interface BuilderProjectDetail {
  id: string;
  name: string;
  description: string;
  stage: string;
  status: string;
  isVerified: boolean;
  address: string;
  pincode: string;
  possessionDate: string | null;
  deliveredOn: string | null;
  reraNumber: string;
  approvingAuthority: string | null;
  totalTowers: number | null;
  totalUnits: number | null;
  landAreaAcres: string | null;
  amenities: string[];
  rejectionReason: string | null;
  revisionNote: string | null;
  viewsCount: number;
  leadsCount: number;
  submittedAt: string | null;
  verifiedAt: string | null;
  firstListedAt: string | null;
  neighborhood: { id: string; name: string; city: string };
  units: Array<{
    id: string;
    bedrooms: number;
    bathrooms: number;
    balconies: number | null;
    areaSqft: number;
    carpetAreaSqft: number | null;
    priceFrom: string;
    totalUnits: number | null;
    availableUnits: number | null;
    floorPlanUrl: string | null;
  }>;
  photos: Array<{ id: string; url: string; sortOrder: number; isRender: boolean }>;
  documents: Array<{
    id: string;
    kind: string;
    originalFilename: string;
    sizeBytes: number;
    createdAt: string;
  }>;
  verifications: Array<{
    id: string;
    decision: string;
    reason: string | null;
    createdAt: string;
    checks: Array<{ kind: string; passed: boolean; note: string | null }>;
  }>;
}

export interface SellerStats {
  rangeDays: number;
  totals: { views: number; saves: number; leads: number; live: number };
  daily: Array<{ date: string; views: number; leads: number }>;
  listings: Array<{
    id: string;
    title: string;
    status: string;
    isVerified: boolean;
    price: number;
    firstListedAt: string | null;
    locality: string;
    bedrooms: number;
    areaSqft: number;
    photo: string | null;
    views: number;
    saves: number;
    leads: number;
  }>;
}

export interface SavedListItem {
  savedAt: string;
  isAvailable: boolean;
  unavailableReason: string | null;
  listing: {
    id: string;
    title: string;
    price: number;
    isVerified: boolean;
    firstListedAt: string | null;
    property: {
      address: string;
      locality: string;
      bedrooms: number;
      bathrooms: number;
      areaSqft: number;
      propertyType: string;
    };
    photos: Array<{ id: string; url: string }>;
    listedBy: { kind: string };
  };
}

export interface SavedList {
  items: SavedListItem[];
}
