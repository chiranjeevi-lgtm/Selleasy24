import { BuyingPurpose, PossessionStatus, Prisma } from '@kamala/db';

/**
 * Ranking a listing against what a buyer told us.
 *
 * Two decisions shape everything here.
 *
 * First, the score is explainable. Every recommendation carries the reasons it
 * was chosen, and those reasons are shown to the buyer. A platform whose whole
 * argument is "we show you what we checked and how" cannot then rank properties
 * by an opaque number — and a buyer who can see *why* something was suggested
 * can tell us when we are wrong.
 *
 * Second, a missing preference scores nothing rather than penalising. A buyer
 * who skipped the locality step has not said "anywhere is equally bad"; they
 * have said nothing, and the remaining signals should decide the order on their
 * own.
 */

export interface BuyerPreferences {
  purpose: BuyingPurpose | null;
  bedroomsWanted: number | null;
  budgetMin: Prisma.Decimal | null;
  budgetMax: Prisma.Decimal | null;
  neighborhoodIds: string[];
}

export interface ScorableListing {
  price: Prisma.Decimal;
  bedrooms: number;
  neighborhoodId: string;
  possession: PossessionStatus;
  /** Owner-listed rather than through an agent. */
  isOwnerListed: boolean;
  /** Price per sq ft against the locality median, as a percentage difference. */
  differenceFromMedianPercent: number | null;
}

export interface Scored {
  score: number;
  reasons: string[];
}

/**
 * How far over the stated maximum a listing may be and still be shown at all.
 *
 * Some stretch is useful — budgets are approximate and a buyer will look a
 * little above. Too much and the recommendations become the expensive listings,
 * which is what buyers expect a portal to do and distrust it for. Anything past
 * this is dropped rather than ranked low, because a property someone said they
 * cannot afford is noise however far down the page it sits.
 *
 * Listings inside the band still score, but at `WEIGHT.budgetStretch` rather
 * than the full `WEIGHT.budgetInRange`, and they say so in their reasons.
 */
const HARD_CEILING = 0.2;

const WEIGHT = {
  budgetInRange: 40,
  budgetStretch: 18,
  locality: 30,
  bedroomsExact: 20,
  bedroomsNear: 9,
  purpose: 10,
} as const;

/**
 * The weights must total 100 so a score reads as a percentage. Checked at
 * module load rather than trusted, because the numbers above are the sort of
 * thing that gets adjusted by hand and quietly stops adding up.
 */
const MAX_SCORE =
  WEIGHT.budgetInRange + WEIGHT.locality + WEIGHT.bedroomsExact + WEIGHT.purpose;

if (MAX_SCORE !== 100) {
  throw new Error(
    `Recommendation weights must total 100, got ${MAX_SCORE}. Adjust WEIGHT in recommendations.ts.`,
  );
}

/** True when the buyer has told us enough for a ranking to mean anything. */
export function hasUsablePreferences(preferences: BuyerPreferences): boolean {
  return (
    preferences.budgetMax !== null ||
    preferences.budgetMin !== null ||
    preferences.bedroomsWanted !== null ||
    preferences.neighborhoodIds.length > 0
  );
}

/**
 * Scores one listing. Returns null when the listing should not be shown at all.
 */
export function score(
  listing: ScorableListing,
  preferences: BuyerPreferences,
): Scored | null {
  const price = Number(listing.price);
  const reasons: string[] = [];
  let total = 0;

  // --- Budget ---------------------------------------------------------------
  const max = preferences.budgetMax === null ? null : Number(preferences.budgetMax);
  const min = preferences.budgetMin === null ? null : Number(preferences.budgetMin);

  if (max !== null) {
    if (price > max * (1 + HARD_CEILING)) {
      // Showing someone a property they said they cannot afford is noise, and
      // it is the specific behaviour that makes portal recommendations useless.
      return null;
    }

    if (price <= max) {
      total += WEIGHT.budgetInRange;
      reasons.push('Within your budget');
    } else {
      total += WEIGHT.budgetStretch;
      const over = Math.round(((price - max) / max) * 100);
      reasons.push(`${over}% above your budget, but close`);
    }
  }

  /*
   * A floor usually means "below this I doubt the quality", so falling under it
   * is worth saying rather than silently ranking down. It does not exclude:
   * a cheap listing that matches everything else may be exactly the find.
   */
  if (min !== null && price < min) {
    reasons.push('Below the range you gave — worth a look anyway');
  }

  // --- Locality -------------------------------------------------------------
  if (preferences.neighborhoodIds.length > 0) {
    if (preferences.neighborhoodIds.includes(listing.neighborhoodId)) {
      total += WEIGHT.locality;
      reasons.push('In an area you chose');
    }
  }

  // --- Configuration --------------------------------------------------------
  if (preferences.bedroomsWanted !== null) {
    const difference = Math.abs(listing.bedrooms - preferences.bedroomsWanted);
    if (difference === 0) {
      total += WEIGHT.bedroomsExact;
      reasons.push(`${listing.bedrooms} BHK, the size you wanted`);
    } else if (difference === 1) {
      total += WEIGHT.bedroomsNear;
      reasons.push(`${listing.bedrooms} BHK — one ${listing.bedrooms > preferences.bedroomsWanted ? 'more' : 'fewer'} than you asked for`);
    }
  }

  // --- Purpose --------------------------------------------------------------
  //
  // Someone buying a home to live in and someone buying to let want different
  // things from the same listing, so the same property ranks differently for
  // each. This is the one part of the score that is a judgement rather than a
  // match, so it carries the smallest weight.
  const purposeReason = scorePurpose(listing, preferences.purpose);
  if (purposeReason) {
    total += WEIGHT.purpose;
    reasons.push(purposeReason);
  }

  return { score: total, reasons };
}

function scorePurpose(
  listing: ScorableListing,
  purpose: BuyingPurpose | null,
): string | null {
  if (purpose === null) {
    return null;
  }

  switch (purpose) {
    case BuyingPurpose.LIVE_IN:
      // Ready to move matters most to someone who needs somewhere to live, and
      // buying direct from the owner is what this platform is for.
      if (listing.possession === PossessionStatus.READY_TO_MOVE) {
        return listing.isOwnerListed
          ? 'Ready to move in, listed by the owner'
          : 'Ready to move in';
      }
      return null;

    case BuyingPurpose.RENT_OUT:
      // A property that cannot be occupied cannot be let, so it earns nothing
      // until it can.
      return listing.possession === PossessionStatus.READY_TO_MOVE
        ? 'Ready to let out immediately'
        : null;

    case BuyingPurpose.INVESTMENT:
      // Priced under the locality median is the signal worth surfacing, and it
      // is one the incumbents compute and hide behind a paywall.
      if (
        listing.differenceFromMedianPercent !== null &&
        listing.differenceFromMedianPercent <= -5
      ) {
        return `Priced ${Math.abs(Math.round(listing.differenceFromMedianPercent))}% under the locality median`;
      }
      return null;
  }
}
