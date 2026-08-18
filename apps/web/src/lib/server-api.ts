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

export interface SellerLead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  status: string;
  contactedAt: string | null;
  createdAt: string;
  listing: { id: string; title: string };
}

export interface CurrentUser {
  id: string;
  email: string;
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
