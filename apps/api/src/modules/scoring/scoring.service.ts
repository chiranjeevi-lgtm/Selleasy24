import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Amenity } from '@kamala/db';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { RegulatoryService } from '../regulatory/regulatory.service';
import { nearestLandmarkKm } from './hyderabad-landmarks';

/**
 * How many amenities exist in the enum today. Used as the denominator for
 * the amenities-completeness component. If the enum grows, this constant
 * should be updated in the same edit — otherwise scores silently deflate.
 */
const TOTAL_AMENITIES = Object.keys(Amenity).length;

/**
 * The transparent breakdown returned alongside the numeric score. Each
 * component reports (i) its actual value, (ii) the max it could have been,
 * and (iii) a short human-readable rationale. That's what the UI renders
 * on the "Why 82?" panel; it also makes the score auditable in logs.
 */
export interface ScoreComponent {
  label: string;
  score: number;
  max: number;
  rationale: string;
}

export interface ScoreBreakdown {
  score: number;
  computedAt: string;
  components: ScoreComponent[];
}

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly regulatory: RegulatoryService,
    private readonly analytics: AnalyticsService,
  ) {}

  // -------------------------------------------------------------------------
  // Listing scoring
  // -------------------------------------------------------------------------

  /**
   * Compute and persist an investment score for a listing. The breakdown
   * is returned so the caller (verifier UI on approval, or an admin batch
   * trigger) can render exactly what the buyer will eventually see.
   *
   * Nothing is fetched inline that already lives on the loaded listing —
   * one wide select up front is preferable to N + 1 queries scattered
   * through the component functions.
   */
  async computeListingScore(listingId: string): Promise<ScoreBreakdown> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        property: {
          include: {
            neighborhood: {
              select: { id: true, medianPricePerSqft: true },
            },
          },
        },
        photos: { select: { id: true } },
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    // ---- Component 1: RERA (25) ----
    // Resale listings usually don't carry a RERA number — that's normal
    // for pre-2017 stock. Missing = neutral (15), not zero. Only Projects
    // (Feature 6 also scores those) get penalised for missing RERA.
    const reraComponent: ScoreComponent = {
      label: 'RERA registration',
      score: 15,
      max: 25,
      rationale: 'Resale listings typically do not carry a RERA number.',
    };

    // ---- Component 2: Locality YoY appreciation (20) ----
    const analytics = await this.analytics
      .getSummary(listing.property.neighborhood.id)
      .catch(() => null);
    const yoy = analytics?.appreciation['1yr'];
    const localityComponent = yoyToComponent(yoy);

    // ---- Component 3: Developer track record (15) ----
    // Resale listings do not have a builder attached. Neutral 8.
    const developerComponent: ScoreComponent = {
      label: 'Developer track record',
      score: 8,
      max: 15,
      rationale: 'Resale listing — builder history is not the primary signal.',
    };

    // ---- Component 4: Infrastructure proximity (15) ----
    const infraComponent = infraProximityComponent(
      listing.property.latitude === null || listing.property.longitude === null
        ? null
        : {
            lat: Number(listing.property.latitude),
            lng: Number(listing.property.longitude),
          },
    );

    // ---- Component 5: Amenities completeness (10) ----
    const amenitiesComponent = amenitiesToComponent(listing.property.amenities.length);

    // ---- Component 6: Price vs locality median (10) ----
    const median =
      listing.property.neighborhood.medianPricePerSqft === null
        ? null
        : Number(listing.property.neighborhood.medianPricePerSqft);
    const pricePerSqft =
      listing.property.areaSqft > 0
        ? Number(listing.price) / listing.property.areaSqft
        : null;
    const priceComponent = priceVsMedianComponent(pricePerSqft, median);

    // ---- Component 7: Photo & description completeness (5) ----
    const completenessComponent = completenessToComponent(
      listing.photos.length,
      listing.description.length,
    );

    const components = [
      reraComponent,
      localityComponent,
      developerComponent,
      infraComponent,
      amenitiesComponent,
      priceComponent,
      completenessComponent,
    ];
    const total = components.reduce((sum, c) => sum + c.score, 0);
    const computedAt = new Date();

    await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        investmentScore: total,
        investmentScoreComputedAt: computedAt,
      },
    });

    return {
      score: total,
      computedAt: computedAt.toISOString(),
      components,
    };
  }

  // -------------------------------------------------------------------------
  // Project scoring
  // -------------------------------------------------------------------------

  async computeProjectScore(projectId: string): Promise<ScoreBreakdown> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        neighborhood: { select: { id: true, medianPricePerSqft: true } },
        builder: { select: { id: true } },
        photos: { select: { id: true } },
        units: { select: { id: true, priceFrom: true, areaSqft: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');

    // ---- Component 1: RERA (25) — mandatory on projects ----
    const reraCheck = await this.regulatory.check(project.reraNumber);
    const reraComponent = reraCheckToComponent(reraCheck);

    // ---- Component 2: Locality YoY (20) ----
    const analytics = await this.analytics
      .getSummary(project.neighborhood.id)
      .catch(() => null);
    const yoy = analytics?.appreciation['1yr'];
    const localityComponent = yoyToComponent(yoy);

    // ---- Component 3: Developer track record (15) ----
    const developerComponent = await this.developerTrackRecordComponent(project.builderId);

    // ---- Component 4: Infrastructure proximity (15) ----
    // Projects don't currently have lat/lng on the model (only through
    // neighborhood centroid). Use neighborhood as a proxy for now — when
    // Project gains lat/lng in a future migration, switch to that.
    const infraComponent: ScoreComponent = {
      label: 'Infrastructure proximity',
      score: 8,
      max: 15,
      rationale: 'Locality-level proxy — per-project coordinates arriving in a future migration.',
    };

    // ---- Component 5: Amenities completeness (10) ----
    const amenitiesComponent = amenitiesToComponent(project.amenities.length);

    // ---- Component 6: Price vs locality median (10) ----
    const median =
      project.neighborhood.medianPricePerSqft === null
        ? null
        : Number(project.neighborhood.medianPricePerSqft);
    // Use the cheapest unit's price/sqft as the project's headline price.
    const cheapestUnit = project.units.reduce<null | { priceFrom: number; areaSqft: number }>(
      (best, unit) => {
        const p = Number(unit.priceFrom);
        if (!Number.isFinite(p) || unit.areaSqft <= 0) return best;
        if (best === null || p < best.priceFrom) {
          return { priceFrom: p, areaSqft: unit.areaSqft };
        }
        return best;
      },
      null,
    );
    const pricePerSqft =
      cheapestUnit === null ? null : cheapestUnit.priceFrom / cheapestUnit.areaSqft;
    const priceComponent = priceVsMedianComponent(pricePerSqft, median);

    // ---- Component 7: Photo & description completeness (5) ----
    const completenessComponent = completenessToComponent(
      project.photos.length,
      project.description.length,
    );

    const components = [
      reraComponent,
      localityComponent,
      developerComponent,
      infraComponent,
      amenitiesComponent,
      priceComponent,
      completenessComponent,
    ];
    const total = components.reduce((sum, c) => sum + c.score, 0);
    const computedAt = new Date();

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        investmentScore: total,
        investmentScoreComputedAt: computedAt,
      },
    });

    return {
      score: total,
      computedAt: computedAt.toISOString(),
      components,
    };
  }

  // -------------------------------------------------------------------------
  // Batch triggers (nightly job hooks — currently manual via admin endpoint)
  // -------------------------------------------------------------------------

  async computeAllListings(): Promise<{ scored: number; failed: number }> {
    const listings = await this.prisma.listing.findMany({
      where: { status: 'APPROVED', isVerified: true },
      select: { id: true },
    });
    let scored = 0;
    let failed = 0;
    for (const { id } of listings) {
      try {
        await this.computeListingScore(id);
        scored++;
      } catch (error) {
        failed++;
        this.logger.warn(
          `Score compute failed for listing ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    this.logger.log(`Listing scoring batch — ${scored} scored, ${failed} failed`);
    return { scored, failed };
  }

  async computeAllProjects(): Promise<{ scored: number; failed: number }> {
    const projects = await this.prisma.project.findMany({
      where: { status: 'APPROVED', isVerified: true },
      select: { id: true },
    });
    let scored = 0;
    let failed = 0;
    for (const { id } of projects) {
      try {
        await this.computeProjectScore(id);
        scored++;
      } catch (error) {
        failed++;
        this.logger.warn(
          `Score compute failed for project ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    this.logger.log(`Project scoring batch — ${scored} scored, ${failed} failed`);
    return { scored, failed };
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  async getListingBreakdown(listingId: string): Promise<ScoreBreakdown> {
    // Re-compute on demand rather than storing the breakdown. The score
    // itself is persisted; the breakdown is cheap to reconstruct and
    // stays authoritative even after inputs shift.
    return this.computeListingScore(listingId);
  }

  async getProjectBreakdown(projectId: string): Promise<ScoreBreakdown> {
    return this.computeProjectScore(projectId);
  }

  // -------------------------------------------------------------------------
  // Internal helpers — developer track record needs DB access, others don't
  // -------------------------------------------------------------------------

  private async developerTrackRecordComponent(builderId: string): Promise<ScoreComponent> {
    const [delivered, active] = await Promise.all([
      this.prisma.project.count({
        where: {
          builderId,
          stage: 'DELIVERED',
          status: 'APPROVED',
        },
      }),
      this.prisma.project.count({
        where: {
          builderId,
          stage: { not: 'DELIVERED' },
          status: 'APPROVED',
        },
      }),
    ]);

    const total = delivered + active;
    if (total === 0) {
      return {
        label: 'Developer track record',
        score: 8,
        max: 15,
        rationale: 'No delivery history on file — first project on the platform.',
      };
    }

    const deliveredRatio = delivered / total;
    if (deliveredRatio >= 0.75) {
      return {
        label: 'Developer track record',
        score: 15,
        max: 15,
        rationale: `${delivered} of ${total} projects delivered.`,
      };
    }
    if (deliveredRatio >= 0.5) {
      return {
        label: 'Developer track record',
        score: 12,
        max: 15,
        rationale: `${delivered} of ${total} projects delivered.`,
      };
    }
    if (deliveredRatio >= 0.25) {
      return {
        label: 'Developer track record',
        score: 8,
        max: 15,
        rationale: `${delivered} of ${total} projects delivered — still building history.`,
      };
    }
    return {
      label: 'Developer track record',
      score: 4,
      max: 15,
      rationale: `Only ${delivered} of ${total} projects delivered.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Pure-function components — no DB, easy to test, easy to re-tune
// ---------------------------------------------------------------------------

function yoyToComponent(yoy: number | null | undefined): ScoreComponent {
  if (yoy === null || yoy === undefined) {
    return {
      label: 'Locality appreciation',
      score: 10,
      max: 20,
      rationale: 'Not enough historical data yet — snapshots are accumulating.',
    };
  }
  if (yoy > 15) return { label: 'Locality appreciation', score: 20, max: 20, rationale: `+${yoy}% in the last year.` };
  if (yoy > 10) return { label: 'Locality appreciation', score: 17, max: 20, rationale: `+${yoy}% in the last year.` };
  if (yoy > 5) return { label: 'Locality appreciation', score: 13, max: 20, rationale: `+${yoy}% in the last year.` };
  if (yoy > 0) return { label: 'Locality appreciation', score: 8, max: 20, rationale: `+${yoy}% in the last year.` };
  return {
    label: 'Locality appreciation',
    score: 3,
    max: 20,
    rationale: `${yoy}% in the last year — softening market.`,
  };
}

function infraProximityComponent(point: { lat: number; lng: number } | null): ScoreComponent {
  if (point === null) {
    return {
      label: 'Infrastructure proximity',
      score: 0,
      max: 15,
      rationale: 'Property coordinates not on file — cannot score proximity to metro / ORR / airport.',
    };
  }
  const nearest = nearestLandmarkKm(point);
  if (nearest === null) {
    return {
      label: 'Infrastructure proximity',
      score: 0,
      max: 15,
      rationale: 'Location is outside the scoring radius (Hyderabad + ~80 km).',
    };
  }
  const km = nearest.km;
  const rat = (score: number, msg: string): ScoreComponent => ({
    label: 'Infrastructure proximity',
    score,
    max: 15,
    rationale: msg,
  });
  const name = nearest.landmark.name;
  if (km < 1) return rat(15, `${km.toFixed(2)} km from ${name}.`);
  if (km < 3) return rat(12, `${km.toFixed(2)} km from ${name}.`);
  if (km < 5) return rat(9, `${km.toFixed(2)} km from ${name}.`);
  if (km < 10) return rat(6, `${km.toFixed(1)} km from ${name}.`);
  return rat(3, `${Math.round(km)} km from the nearest metro / ORR / airport.`);
}

function amenitiesToComponent(count: number): ScoreComponent {
  const ratio = Math.min(1, count / TOTAL_AMENITIES);
  if (ratio >= 0.6) return { label: 'Amenities', score: 10, max: 10, rationale: `${count} of ${TOTAL_AMENITIES} listed amenities.` };
  if (ratio >= 0.4) return { label: 'Amenities', score: 8, max: 10, rationale: `${count} of ${TOTAL_AMENITIES} listed amenities.` };
  if (ratio >= 0.25) return { label: 'Amenities', score: 6, max: 10, rationale: `${count} of ${TOTAL_AMENITIES} listed amenities.` };
  if (ratio >= 0.1) return { label: 'Amenities', score: 4, max: 10, rationale: `${count} of ${TOTAL_AMENITIES} listed amenities.` };
  return { label: 'Amenities', score: 2, max: 10, rationale: `${count} of ${TOTAL_AMENITIES} listed amenities.` };
}

function priceVsMedianComponent(
  pricePerSqft: number | null,
  median: number | null,
): ScoreComponent {
  if (pricePerSqft === null || median === null || median <= 0) {
    return {
      label: 'Price vs locality median',
      score: 5,
      max: 10,
      rationale: 'Insufficient data — median for this locality is not yet computed.',
    };
  }
  const delta = ((pricePerSqft - median) / median) * 100;
  const rat = (score: number, msg: string): ScoreComponent => ({
    label: 'Price vs locality median',
    score,
    max: 10,
    rationale: msg,
  });
  if (delta < -20) return rat(10, `${Math.abs(delta).toFixed(0)}% below locality median — check for red flags.`);
  if (delta < -10) return rat(9, `${Math.abs(delta).toFixed(0)}% below locality median.`);
  if (delta < 0) return rat(8, `${Math.abs(delta).toFixed(0)}% below locality median.`);
  if (delta < 10) return rat(6, `${delta.toFixed(0)}% above locality median.`);
  if (delta < 20) return rat(4, `${delta.toFixed(0)}% above locality median.`);
  return rat(2, `${delta.toFixed(0)}% above locality median.`);
}

function completenessToComponent(
  photoCount: number,
  descriptionLength: number,
): ScoreComponent {
  let score = 0;
  const notes: string[] = [];
  if (photoCount >= 15) {
    score += 3;
    notes.push(`${photoCount} photos`);
  } else if (photoCount >= 10) {
    score += 2;
    notes.push(`${photoCount} photos`);
  } else if (photoCount >= 5) {
    score += 1;
    notes.push(`${photoCount} photos`);
  } else {
    notes.push(`only ${photoCount} photos`);
  }

  if (descriptionLength > 500) {
    score += 2;
    notes.push('detailed description');
  } else if (descriptionLength >= 200) {
    score += 1;
    notes.push('short description');
  } else {
    notes.push('minimal description');
  }

  return {
    label: 'Photo & description completeness',
    score,
    max: 5,
    rationale: notes.join(', ') + '.',
  };
}

function reraCheckToComponent(check: {
  status: string;
  isCurrent: boolean;
  found: boolean;
}): ScoreComponent {
  if (!check.found) {
    return {
      label: 'RERA registration',
      score: 0,
      max: 25,
      rationale: 'Declared RERA number is not on file with the authority.',
    };
  }
  if (check.status === 'REVOKED') {
    return {
      label: 'RERA registration',
      score: 0,
      max: 25,
      rationale: 'RERA registration was revoked by the authority.',
    };
  }
  if (check.status === 'EXPIRED' || !check.isCurrent) {
    return {
      label: 'RERA registration',
      score: 5,
      max: 25,
      rationale: 'RERA registration has lapsed or expired.',
    };
  }
  if (check.status === 'UNDER_REVIEW') {
    return {
      label: 'RERA registration',
      score: 15,
      max: 25,
      rationale: 'RERA registration is currently under review.',
    };
  }
  return {
    label: 'RERA registration',
    score: 25,
    max: 25,
    rationale: 'Registered and current with the authority.',
  };
}
