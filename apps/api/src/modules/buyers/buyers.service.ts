import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PUBLIC_LISTING_WHERE } from '@kamala/db';

import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type {
  AboutStepDto,
  BudgetStepDto,
  LocalitiesStepDto,
  PurposeStepDto,
} from './buyers.dto';
import {
  hasUsablePreferences,
  score,
  type BuyerPreferences,
} from './recommendations';

/** How many listings to rank. Bounded so one request cannot scan the table. */
const CANDIDATE_LIMIT = 200;

@Injectable()
export class BuyersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * The buyer's own profile, created on first read.
   *
   * Upserting here rather than at registration keeps the account creation path
   * unchanged, and means an account that predates this feature gets a profile
   * the first time it needs one.
   */
  async getProfile(userId: string) {
    const profile = await this.prisma.buyerProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
      include: {
        localities: {
          select: {
            neighborhood: { select: { id: true, name: true, city: true } },
          },
        },
      },
    });

    return this.present(profile);
  }

  async savePurpose(userId: string, dto: PurposeStepDto) {
    return this.update(userId, {
      purpose: dto.purpose,
      householdSize: dto.householdSize ?? null,
      bedroomsWanted: dto.bedroomsWanted ?? null,
    });
  }

  async saveBudget(userId: string, dto: BudgetStepDto) {
    return this.update(userId, {
      budgetMin: dto.budgetMin === undefined ? null : new Prisma.Decimal(dto.budgetMin),
      budgetMax: dto.budgetMax === undefined ? null : new Prisma.Decimal(dto.budgetMax),
      monthlyIncome:
        dto.monthlyIncome === undefined ? null : new Prisma.Decimal(dto.monthlyIncome),
    });
  }

  /**
   * Replaces the whole locality set.
   *
   * Sending the complete set rather than add/remove calls: the picker lets a
   * buyer toggle freely, and two quick taps would otherwise race into a state
   * neither side intended.
   */
  async saveLocalities(userId: string, dto: LocalitiesStepDto) {
    if (dto.neighborhoodIds.length > 0) {
      const found = await this.prisma.neighborhood.count({
        where: { id: { in: dto.neighborhoodIds } },
      });
      if (found !== dto.neighborhoodIds.length) {
        throw new BadRequestException('One of those areas is not on the list.');
      }
    }

    const profile = await this.prisma.buyerProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
      select: { id: true },
    });

    await this.prisma.$transaction([
      this.prisma.buyerPreferredLocality.deleteMany({
        where: { buyerProfileId: profile.id },
      }),
      this.prisma.buyerPreferredLocality.createMany({
        data: dto.neighborhoodIds.map((neighborhoodId) => ({
          buyerProfileId: profile.id,
          neighborhoodId,
        })),
      }),
    ]);

    return this.getProfile(userId);
  }

  /**
   * The last step, which also marks the run finished.
   *
   * `completedAt` is what separates "answered nothing" from "never got this
   * far" — the second is a prompt worth showing again, the first is not.
   */
  async saveAbout(userId: string, dto: AboutStepDto) {
    return this.update(userId, {
      occupation: dto.occupation ?? null,
      completedAt: new Date(),
    });
  }

  /** Ends the run without answering the remaining steps. */
  async skipRemaining(userId: string) {
    return this.update(userId, { completedAt: new Date() });
  }

  // -------------------------------------------------------------------------
  // Recommendations
  // -------------------------------------------------------------------------

  /**
   * Listings ranked against what the buyer told us.
   *
   * Returns an empty list rather than falling back to "newest first" when we
   * know nothing about them. A row of arbitrary properties labelled
   * "recommended for you" is exactly the dishonesty this platform exists to
   * displace — if we cannot personalise, we should not claim to.
   */
  async recommendations(userId: string, limit = 12) {
    const profile = await this.prisma.buyerProfile.findUnique({
      where: { userId },
      include: { localities: { select: { neighborhoodId: true } } },
    });

    const preferences: BuyerPreferences = {
      purpose: profile?.purpose ?? null,
      bedroomsWanted: profile?.bedroomsWanted ?? null,
      budgetMin: profile?.budgetMin ?? null,
      budgetMax: profile?.budgetMax ?? null,
      neighborhoodIds: profile?.localities.map((l) => l.neighborhoodId) ?? [],
    };

    if (!hasUsablePreferences(preferences)) {
      return { items: [], personalised: false };
    }

    /*
     * Candidates are narrowed in SQL where it is cheap and exact — visibility,
     * and the hard budget ceiling — then scored in memory, where the purpose
     * rules and the explanations live. Pushing the whole score into SQL would
     * mean the reasons could not be produced alongside it.
     */
    const ceiling =
      preferences.budgetMax === null
        ? undefined
        : new Prisma.Decimal(Math.round(Number(preferences.budgetMax) * 1.2));

    const candidates = await this.prisma.listing.findMany({
      where: {
        ...PUBLIC_LISTING_WHERE,
        ...(ceiling && { price: { lte: ceiling } }),
      },
      orderBy: { firstListedAt: 'desc' },
      take: CANDIDATE_LIMIT,
      select: {
        id: true,
        title: true,
        price: true,
        firstListedAt: true,
        isVerified: true,
        seller: { select: { sellerKind: true } },
        property: {
          select: {
            address: true,
            bedrooms: true,
            bathrooms: true,
            areaSqft: true,
            propertyType: true,
            possession: true,
            neighborhoodId: true,
            neighborhood: {
              select: { id: true, name: true, city: true, medianPricePerSqft: true },
            },
          },
        },
        photos: {
          select: { id: true, storageKey: true },
          orderBy: { sortOrder: 'asc' },
          take: 1,
        },
      },
    });

    const ranked = candidates
      .map((listing) => {
        const median =
          listing.property.neighborhood.medianPricePerSqft === null
            ? null
            : Number(listing.property.neighborhood.medianPricePerSqft);

        const perSqft =
          listing.property.areaSqft > 0
            ? Number(listing.price) / listing.property.areaSqft
            : null;

        const differenceFromMedianPercent =
          median !== null && median > 0 && perSqft !== null
            ? ((perSqft - median) / median) * 100
            : null;

        const result = score(
          {
            price: listing.price,
            bedrooms: listing.property.bedrooms,
            neighborhoodId: listing.property.neighborhoodId,
            possession: listing.property.possession,
            isOwnerListed: listing.seller.sellerKind === 'OWNER',
            differenceFromMedianPercent,
          },
          preferences,
        );

        return result === null ? null : { listing, ...result };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      /*
       * A listing matching nothing scores zero, and putting it under a
       * "recommended" heading would be a claim we cannot support.
       */
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Ties break on recency, so an equally good newer listing surfaces.
        const aDate = a.listing.firstListedAt?.getTime() ?? 0;
        const bDate = b.listing.firstListedAt?.getTime() ?? 0;
        return bDate - aDate;
      })
      .slice(0, limit);

    return {
      personalised: true,
      items: ranked.map((entry) => ({
        id: entry.listing.id,
        title: entry.listing.title,
        price: Number(entry.listing.price),
        isVerified: entry.listing.isVerified,
        firstListedAt: entry.listing.firstListedAt,
        matchScore: entry.score,
        /** Shown to the buyer. An unexplained ranking is not worth having. */
        reasons: entry.reasons,
        property: {
          address: entry.listing.property.address,
          bedrooms: entry.listing.property.bedrooms,
          bathrooms: entry.listing.property.bathrooms,
          areaSqft: entry.listing.property.areaSqft,
          propertyType: entry.listing.property.propertyType,
          locality: entry.listing.property.neighborhood.name,
          city: entry.listing.property.neighborhood.city,
        },
        photos: entry.listing.photos.map((photo) => ({
          id: photo.id,
          url: this.storage.publicUrl(photo.storageKey),
        })),
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Writes one step's fields.
   *
   * `BuyerProfileUncheckedUpdateInput` rather than the checked variant: the
   * unchecked shape takes `userId` as a plain column, so the same object can
   * serve both branches of the upsert. The checked one would want a nested
   * `user: { connect }` on create and reject the scalar, forcing two nearly
   * identical payloads that could drift apart.
   */
  private async update(userId: string, data: Prisma.BuyerProfileUncheckedUpdateInput) {
    await this.prisma.buyerProfile.upsert({
      where: { userId },
      update: data,
      create: { ...data, userId } as Prisma.BuyerProfileUncheckedCreateInput,
    });

    return this.getProfile(userId);
  }

  private present(profile: {
    purpose: unknown;
    householdSize: number | null;
    bedroomsWanted: number | null;
    budgetMin: Prisma.Decimal | null;
    budgetMax: Prisma.Decimal | null;
    occupation: unknown;
    monthlyIncome: Prisma.Decimal | null;
    completedAt: Date | null;
    localities: Array<{ neighborhood: { id: string; name: string; city: string } }>;
  }) {
    return {
      purpose: profile.purpose,
      householdSize: profile.householdSize,
      bedroomsWanted: profile.bedroomsWanted,
      // Numbers rather than Decimal strings: every consumer wants a number, and
      // the values are far inside the safe integer range.
      budgetMin: profile.budgetMin === null ? null : Number(profile.budgetMin),
      budgetMax: profile.budgetMax === null ? null : Number(profile.budgetMax),
      occupation: profile.occupation,
      monthlyIncome: profile.monthlyIncome === null ? null : Number(profile.monthlyIncome),
      completedAt: profile.completedAt,
      localities: profile.localities.map((entry) => entry.neighborhood),
    };
  }
}
