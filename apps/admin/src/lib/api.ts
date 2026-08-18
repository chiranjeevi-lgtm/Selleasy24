import 'server-only';

import { getAccessToken } from './session';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  fieldErrors?: Array<{ field: string; message: string }>;
  constructor(
    readonly status: number,
    message: string,
    readonly reference?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function authed<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
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
      if (body.message) message = body.message;
      reference = body.reference;
      fieldErrors = body.errors;
    } catch {
      /* keep status-derived message */
    }
    const error = new ApiError(response.status, message, reference);
    error.fieldErrors = fieldErrors;
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueueItem {
  id: string;
  title: string;
  price: string;
  submittedAt: string | null;
  createdAt: string;
  waitingHours: number;
  slaBreached: boolean;
  seller: { id: string; fullName: string; sellerKind: string | null; reraNumber: string | null };
  property: {
    address: string;
    propertyType: string;
    bedrooms: number;
    areaSqft: number;
    neighborhood: { name: string; city: string };
  };
  _count: { photos: number; documents: number };
}

export interface Queue {
  total: number;
  overdue: number;
  slaHours: number;
  items: QueueItem[];
}

export interface ReviewDocument {
  id: string;
  kind: string;
  idProofKind: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ReviewListing {
  id: string;
  title: string;
  description: string;
  price: string;
  status: string;
  submittedAt: string | null;
  firstListedAt: string | null;
  property: {
    address: string;
    pincode: string;
    propertyType: string;
    bedrooms: number;
    bathrooms: number;
    areaSqft: number;
    yearBuilt: number | null;
    neighborhood: { name: string; city: string; pincode: string };
  };
  seller: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    sellerKind: string | null;
    reraNumber: string | null;
    isEmailVerified: boolean;
    createdAt: string;
    _count: { listings: number };
  };
  photos: Array<{ id: string; url: string; sortOrder: number }>;
  documents: ReviewDocument[];
  priceHistory: Array<{ price: string; previousPrice: string | null; changedAt: string }>;
  verifications: Array<{
    id: string;
    decision: string;
    reason: string | null;
    internalNotes: string | null;
    createdAt: string;
    verifier: { id: string; fullName: string };
    checks: Array<{ kind: string; passed: boolean; note: string | null }>;
  }>;
}

export interface ReportItem {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  listing: {
    id: string;
    title: string;
    status: string;
    seller: { id: string; fullName: string };
  };
  reporter: { id: string; email: string } | null;
}

export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

export const adminApi = {
  me: () => authed<StaffUser>('/auth/me'),
  queue: (limit = 50) => authed<Queue>(`/verification/queue?limit=${limit}`),
  review: (id: string) => authed<ReviewListing>(`/verification/listings/${id}`),
  decide: (id: string, payload: unknown) =>
    authed(`/verification/listings/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  reports: () => authed<ReportItem[]>('/reports'),
  resolveReport: (id: string, payload: unknown) =>
    authed(`/reports/${id}/resolve`, { method: 'PATCH', body: JSON.stringify(payload) }),
};

/**
 * URL for a document, proxied through this app.
 *
 * Documents are never linked directly at the API: the browser would need to send
 * the bearer token, which means putting it somewhere JavaScript can read. Instead
 * a route handler in this app attaches the token server-side and streams the
 * bytes through.
 */
export function documentUrl(documentId: string): string {
  return `/documents/${documentId}`;
}
