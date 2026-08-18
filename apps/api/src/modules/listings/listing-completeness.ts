import type { Property } from '@kamala/db';

/**
 * Listing completeness.
 *
 * The PRD's top-scored pain point is "listings contain inconsistent or
 * incomplete information". Required fields already gate submission, so this
 * measures the *optional* detail — the fields a seller can skip and usually
 * does, which are also the ones buyers filter and compare on.
 *
 * It deliberately does not block anything. A seller who cannot answer a
 * question should not be stuck; they should be shown what answering is worth.
 * 99acres and Housing both surface this as a percentage for the same reason,
 * and it measurably lifts how much sellers fill in.
 *
 * Scores are a flat weighted sum rather than anything cleverer, because the
 * number is shown to sellers and has to be explainable: every point maps to one
 * named field they can go and fill in.
 */

/** A field worth points, and what to tell the seller about it. */
interface ScoredField {
  /** Stable key so the UI can deep-link to the right form step. */
  key: string;
  label: string;
  weight: number;
  /** Why a buyer cares — shown next to the prompt. */
  reason: string;
  isPresent: (property: PropertyFacts) => boolean;
}

/** The subset of Property this module reads. */
export type PropertyFacts = Pick<
  Property,
  | 'carpetAreaSqft'
  | 'floor'
  | 'totalFloors'
  | 'facing'
  | 'furnishing'
  | 'balconies'
  | 'coveredParking'
  | 'openParking'
  | 'amenities'
  | 'ownership'
  | 'approvingAuthority'
  | 'yearBuilt'
>;

/**
 * Weights total exactly 100.
 *
 * Ownership and sanctioning authority carry the most because they are what a
 * verification officer checks against the deed and the approved plan — on this
 * platform they are worth more than a comfort field like facing.
 */
const SCORED_FIELDS: readonly ScoredField[] = [
  {
    key: 'ownership',
    label: 'Ownership type',
    weight: 14,
    reason: 'Buyers and our verification officers check this against the sale deed.',
    isPresent: (p) => p.ownership !== null,
  },
  {
    key: 'approvingAuthority',
    label: 'Approving authority',
    weight: 14,
    reason: 'GHMC, HMDA or DTCP approval is the first thing a cautious buyer looks for.',
    isPresent: (p) => p.approvingAuthority !== null,
  },
  {
    key: 'amenities',
    label: 'Amenities',
    weight: 12,
    reason: 'Buyers filter on these, so a blank list keeps you out of their results.',
    // Three is where the list starts being useful rather than decorative.
    isPresent: (p) => p.amenities.length >= 3,
  },
  {
    key: 'carpetAreaSqft',
    label: 'Carpet area',
    weight: 12,
    reason: 'The usable area. Quoting only built-up makes buyers assume the worst.',
    isPresent: (p) => p.carpetAreaSqft !== null,
  },
  {
    key: 'parking',
    label: 'Parking',
    weight: 10,
    reason: 'One of the most common filters in Hyderabad.',
    isPresent: (p) => p.coveredParking !== null || p.openParking !== null,
  },
  {
    key: 'furnishing',
    label: 'Furnishing',
    weight: 10,
    reason: 'Changes what a buyer expects to spend after moving in.',
    isPresent: (p) => p.furnishing !== null,
  },
  {
    key: 'floor',
    label: 'Floor and total floors',
    weight: 10,
    reason: 'Buyers screen on floor — ground and top floors suit different families.',
    // `floor` is legitimately 0 for ground, so this must be a null check and
    // never a truthiness check.
    isPresent: (p) => p.floor !== null && p.totalFloors !== null,
  },
  {
    key: 'yearBuilt',
    label: 'Year built',
    weight: 8,
    reason: 'Age of the property affects loan eligibility.',
    isPresent: (p) => p.yearBuilt !== null,
  },
  {
    key: 'facing',
    label: 'Facing',
    weight: 6,
    reason: 'Many buyers filter on direction for vaastu reasons.',
    isPresent: (p) => p.facing !== null,
  },
  {
    key: 'balconies',
    label: 'Balconies',
    weight: 4,
    reason: 'A small detail buyers notice when comparing two similar flats.',
    isPresent: (p) => p.balconies !== null,
  },
];

/** Guards the weights at module load — a typo here would silently cap the score. */
const TOTAL_WEIGHT = SCORED_FIELDS.reduce((sum, field) => sum + field.weight, 0);
if (TOTAL_WEIGHT !== 100) {
  throw new Error(`Completeness weights must total 100, got ${TOTAL_WEIGHT}.`);
}

export interface CompletenessGap {
  key: string;
  label: string;
  weight: number;
  reason: string;
}

export interface CompletenessResult {
  /** 0-100. */
  score: number;
  missing: CompletenessGap[];
}

export function scoreCompleteness(property: PropertyFacts): CompletenessResult {
  const missing: CompletenessGap[] = [];
  let earned = 0;

  for (const field of SCORED_FIELDS) {
    if (field.isPresent(property)) {
      earned += field.weight;
    } else {
      missing.push({
        key: field.key,
        label: field.label,
        weight: field.weight,
        reason: field.reason,
      });
    }
  }

  // Heaviest gap first: the seller should see the most valuable thing to fix.
  missing.sort((a, b) => b.weight - a.weight);

  return { score: earned, missing };
}
