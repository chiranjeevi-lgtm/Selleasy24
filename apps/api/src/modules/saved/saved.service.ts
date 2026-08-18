import { Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus, Prisma, PUBLIC_LISTING_SELECT } from '@kamala/db';

import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';

/**
 * A buyer's shortlist.
 *
 * The PRD asks for two things that pull in opposite directions: the list must
 * persist across sessions and devices, and it must "reflect the listing's
 * current live status". So it is stored server-side, and read *without* the
 * public-visibility filter — a home that sold last week has to still appear,
 * marked as gone, rather than silently vanishing from the buyer's own list.
 */
@Injectable()
export class SavedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Saves a listing. Saving something already saved is a success, not an error.
   *
   * `upsert` on the unique (userId, listingId) pair rather than a
   * findFirst-then-create, which would race a double-click into a constraint
   * violation the buyer would see as a failure.
   */
  async save(userId: string, listingId: string): Promise<{ saved: true }> {
    /*
     * Only listings that are publicly visible can be saved. Without this a
     * crafted id would let anyone confirm the existence of a draft or rejected
     * listing by whether saving it succeeded.
     */
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, status: ListingStatus.APPROVED, isVerified: true },
      select: { id: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found.');
    }

    await this.prisma.savedListing.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId },
      // Nothing to change — the row existing is the whole state.
      update: {},
    });

    return { saved: true };
  }

  /** Removing something that was never saved is also a success. */
  async unsave(userId: string, listingId: string): Promise<{ saved: false }> {
    await this.prisma.savedListing.deleteMany({ where: { userId, listingId } });
    return { saved: false };
  }

  /** Ids only — used to render the correct toggle state across a results page. */
  async savedIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.savedListing.findMany({
      where: { userId },
      select: { listingId: true },
    });
    return rows.map((row) => row.listingId);
  }

  async list(userId: string) {
    const saved = await this.prisma.savedListing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        listing: {
          select: {
            ...PUBLIC_LISTING_SELECT,
            // Not part of the public projection: the buyer needs to know their
            // shortlisted home is no longer available, and why.
            status: true,
          },
        },
      },
    });

    return {
      items: saved.map((row) => {
        const listing = row.listing;
        const isAvailable =
          listing.status === ListingStatus.APPROVED && listing.isVerified;

        return {
          savedAt: row.createdAt,
          isAvailable,
          /**
           * A plain reason, not the raw status. "SUSPENDED" means nothing to a
           * buyer, and the distinction between an archived and a withdrawn
           * listing is ours, not theirs.
           */
          unavailableReason: isAvailable ? null : this.unavailableReason(listing.status),
          listing: {
            id: listing.id,
            title: listing.title,
            price: Number(listing.price),
            isVerified: listing.isVerified,
            firstListedAt: listing.firstListedAt,
            property: {
              address: listing.property.address,
              locality: listing.property.neighborhood.name,
              bedrooms: listing.property.bedrooms,
              bathrooms: listing.property.bathrooms,
              areaSqft: listing.property.areaSqft,
              propertyType: listing.property.propertyType,
            },
            photos: listing.photos.map((photo) => ({
              id: photo.id,
              url: this.storage.publicUrl(photo.storageKey),
            })),
            listedBy: {
              kind: listing.seller.sellerKind === 'OWNER' ? 'OWNER' : 'BROKER',
            },
          },
        };
      }),
    };
  }

  private unavailableReason(status: ListingStatus): string {
    switch (status) {
      case ListingStatus.ARCHIVED:
        return 'This home is no longer on the market.';
      case ListingStatus.SUSPENDED:
        return 'This listing has been withdrawn while we look into it.';
      default:
        // Back under review after an edit, so it is temporarily not public.
        return 'This listing is being re-checked and is not visible right now.';
    }
  }
}

/** Shared shape so the controller and the web client cannot drift. */
export type SavedList = Prisma.PromiseReturnType<SavedService['list']>;
