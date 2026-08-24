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

export interface ProjectQueueItem {
  id: string;
  name: string;
  stage: string;
  reraNumber: string;
  address: string;
  possessionDate: string | null;
  submittedAt: string | null;
  createdAt: string;
  waitingHours: number;
  slaBreached: boolean;
  builder: { id: string; fullName: string; reraNumber: string | null };
  neighborhood: { name: string; city: string };
  _count: { photos: number; documents: number; units: number };
}

export interface ProjectQueue {
  total: number;
  overdue: number;
  slaHours: number;
  items: ProjectQueueItem[];
}

export interface ReviewProject {
  id: string;
  name: string;
  description: string;
  stage: string;
  status: string;
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
  submittedAt: string | null;
  firstListedAt: string | null;
  neighborhood: { name: string; city: string; pincode: string };
  builder: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    reraNumber: string | null;
    isEmailVerified: boolean;
    isPhoneVerified: boolean;
    createdAt: string;
    _count: { builderProjects: number };
  };
  units: Array<{
    id: string;
    bedrooms: number;
    bathrooms: number;
    areaSqft: number;
    carpetAreaSqft: number | null;
    priceFrom: string;
    totalUnits: number | null;
    availableUnits: number | null;
  }>;
  photos: Array<{ id: string; url: string; sortOrder: number; isRender: boolean }>;
  documents: ReviewDocument[];
  verifications: Array<{
    id: string;
    decision: string;
    reason: string | null;
    internalNotes: string | null;
    createdAt: string;
    verifier: { id: string; fullName: string };
    checks: Array<{ kind: string; passed: boolean; note: string | null }>;
  }>;
  /**
   * Which checks this project's stage makes mandatory. Supplied by the API so
   * the rule lives in one place — a checklist that disagrees with the endpoint
   * enforcing it is worse than no checklist.
   */
  requiredChecks: string[];
}

/**
 * Dashboard figures.
 *
 * Every median and rate is nullable, and nullable means "not enough to say"
 * rather than zero. The UI must render those as an em dash, never as 0 — a
 * dashboard reporting "0 hours to decision" because nothing has been decided
 * is worse than one reporting nothing.
 */
export interface Metrics {
  generatedAt: string;
  windowDays: number;
  slaHours: number;
  /** Below this, a median is shown but flagged as drawn from too little. */
  minConfidentSample: number;

  verification: {
    pendingListings: number;
    pendingProjects: number;
    overdue: number;
    decided: {
      total: number;
      approved: number;
      rejected: number;
      revisionRequested: number;
    };
    medianHoursToDecision: number | null;
    p90HoursToDecision: number | null;
    withinSlaPercent: number | null;
    timedSample: number;
  };

  funnel: {
    views: number;
    shortlists: number;
    enquiries: number;
    siteVisits: number;
    sold: number;
    shortlistRate: number | null;
    enquiryRate: number | null;
    visitRate: number | null;
  };

  leads: {
    total: number;
    new: number;
    contacted: number;
    interested: number;
    notInterested: number;
    converted: number;
    /** Seller-reported, and systematically under-counted. Label it as such. */
    conversionPercent: number | null;
    medianResponseHours: number | null;
    respondedSample: number;
    unansweredOver48h: number;
    unansweredHours: number;
  };

  sales: {
    sold: number;
    throughPlatform: number;
    notThroughPlatform: number;
    notAnswered: number;
    /** Of those who answered, not of all sales. */
    attributedPercent: number | null;
    medianPriceGapPercent: number | null;
    priceDisclosed: number;
  };

  growth: {
    registrations: {
      total: number;
      buyers: number;
      owners: number;
      brokers: number;
      builders: number;
    };
    daily: Array<{
      date: string;
      registrations: number;
      listingsSubmitted: number;
      enquiries: number;
    }>;
  };

  inventory: {
    liveListings: number;
    draftListings: number;
    pausedListings: number;
    soldListings: number;
    rejectedListings: number;
    liveProjects: number;
    draftProjects: number;
    suspendedUsers: number;
  };

  onboarding: {
    buyers: number;
    started: number;
    completed: number;
    completionPercent: number | null;
  };

  moderation: { openReports: number };
}

export const adminApi = {
  me: () => authed<StaffUser>('/auth/me'),
  metrics: (days = 30) => authed<Metrics>(`/admin/metrics?days=${days}`),
  queue: (limit = 50) => authed<Queue>(`/verification/queue?limit=${limit}`),
  review: (id: string) => authed<ReviewListing>(`/verification/listings/${id}`),
  decide: (id: string, payload: unknown) =>
    authed(`/verification/listings/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  projectQueue: (limit = 50) =>
    authed<ProjectQueue>(`/verification/projects/queue?limit=${limit}`),
  reviewProject: (id: string) => authed<ReviewProject>(`/verification/projects/${id}`),
  decideProject: (id: string, payload: unknown) =>
    authed(`/verification/projects/${id}/decide`, {
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

/**
 * Project documents live in their own table and stream from a different API
 * route, so they need their own proxy path — the two ids are not interchangeable
 * and a shared route would have to guess which table to look in.
 */
export function projectDocumentUrl(documentId: string): string {
  return `/project-documents/${documentId}`;
}
