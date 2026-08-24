import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentKind,
  ListingStatus,
  Prisma,
  SiteVisitStatus,
  type Listing,
} from '@kamala/db';
import { randomUUID } from 'node:crypto';

import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import {
  MAX_PHOTOS,
  MIN_PHOTOS,
  validatePhoto,
} from '../../common/storage/file-validation';
import type { RequestContext } from '../auth/auth.service';
import { scoreCompleteness } from './listing-completeness';
import {
  REQUIRED_DOCUMENT_KINDS,
  SELLER_LISTING_FIELDS,
  SELLER_PROPERTY_FIELDS,
  type CreateListingDto,
  type MarkSoldDto,
  type UpdateListingDto,
} from './listings.dto';

/**
 * Copies across only the keys the caller actually supplied.
 *
 * A partial update DTO cannot be spread into Prisma directly: an absent key and
 * a key explicitly set to `undefined` are the same thing to Prisma, but writing
 * `{ furnishing: undefined }` alongside a real change is easy to do by accident
 * and silently means "leave alone" rather than "clear". Filtering here keeps the
 * intent explicit and the update payload minimal.
 */
function pickDefined<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const result: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * States in which a seller may still edit a listing.
 *
 * An APPROVED listing is deliberately excluded. Allowing edits after
 * verification would let a seller get a modest property approved and then swap
 * in different details behind the verified badge — which is precisely the fraud
 * this platform exists to prevent. Editing an approved listing requires
 * re-review, handled in the verification module.
 */
const EDITABLE_STATUSES: readonly ListingStatus[] = [
  ListingStatus.DRAFT,
  ListingStatus.REJECTED,
];

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Creation and editing
  // -------------------------------------------------------------------------

  async create(sellerId: string, dto: CreateListingDto, ctx: RequestContext): Promise<Listing> {
    // Locality is fixed reference data; a forged id must not create a property
    // pointing at nothing.
    const neighborhood = await this.prisma.neighborhood.findUnique({
      where: { id: dto.neighborhoodId },
      select: { id: true, pincode: true, name: true },
    });

    if (!neighborhood) {
      throw new BadRequestException('Unknown locality.');
    }

    const listing = await this.prisma.$transaction(async (tx) => {
      const property = await tx.property.create({
        data: {
          ...pickDefined(dto, SELLER_PROPERTY_FIELDS),
          // Required by the schema, so Zod guarantees it is present here. Named
          // explicitly rather than left to the spread so the type is provably
          // satisfied without a cast.
          possession: dto.possession,
          propertyType: dto.propertyType,
          bedrooms: dto.bedrooms,
          bathrooms: dto.bathrooms,
          areaSqft: dto.areaSqft,
          address: dto.address,
          pincode: dto.pincode,
          neighborhoodId: neighborhood.id,
        },
      });

      const created = await tx.listing.create({
        data: {
          propertyId: property.id,
          sellerId,
          title: dto.title,
          description: dto.description,
          price: new Prisma.Decimal(dto.price),
          priceNegotiable: dto.priceNegotiable,
          status: ListingStatus.DRAFT,
          // firstListedAt stays null until the first approval. It is the honest
          // "listed N days ago" anchor and is never set here.
        },
      });

      // Initial price is the first row of history. Recorded from creation because
      // price history cannot be reconstructed later.
      await tx.priceHistory.create({
        data: {
          listingId: created.id,
          price: new Prisma.Decimal(dto.price),
          previousPrice: null,
          changedById: sellerId,
        },
      });

      await this.audit.recordInTransaction(tx, {
        actorId: sellerId,
        action: AuditAction.LISTING_CREATED,
        entityType: 'listing',
        entityId: created.id,
        metadata: { propertyId: property.id, locality: neighborhood.name },
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      return created;
    });

    return listing;
  }

  async update(
    sellerId: string,
    listingId: string,
    dto: UpdateListingDto,
    ctx: RequestContext,
  ): Promise<Listing> {
    const listing = await this.assertOwnedBySeller(listingId, sellerId);
    this.assertEditable(listing);

    const priceChanged = dto.price !== undefined && !listing.price.equals(dto.price);

    return this.prisma.$transaction(async (tx) => {
      const propertyChanges = pickDefined(dto, SELLER_PROPERTY_FIELDS);

      if (Object.keys(propertyChanges).length > 0 || dto.neighborhoodId !== undefined) {
        if (dto.neighborhoodId !== undefined) {
          const exists = await tx.neighborhood.findUnique({
            where: { id: dto.neighborhoodId },
            select: { id: true },
          });
          if (!exists) {
            throw new BadRequestException('Unknown locality.');
          }
        }

        await tx.property.update({
          where: { id: listing.propertyId },
          data: {
            ...propertyChanges,
            ...(dto.neighborhoodId !== undefined && { neighborhoodId: dto.neighborhoodId }),
          },
        });
      }

      const updated = await tx.listing.update({
        where: { id: listingId },
        data: {
          ...pickDefined(dto, SELLER_LISTING_FIELDS),
          // Price is separate: it is a Decimal, and a change has to be recorded
          // in the append-only history below.
          ...(dto.price !== undefined && { price: new Prisma.Decimal(dto.price) }),
          // Editing a rejected listing returns it to draft and clears the stale
          // rejection reason, so the seller is not shown an outdated failure.
          ...(listing.status === ListingStatus.REJECTED && {
            status: ListingStatus.DRAFT,
            rejectionReason: null,
          }),
        },
      });

      if (priceChanged && dto.price !== undefined) {
        await tx.priceHistory.create({
          data: {
            listingId,
            price: new Prisma.Decimal(dto.price),
            previousPrice: listing.price,
            changedById: sellerId,
          },
        });

        await this.audit.recordInTransaction(tx, {
          actorId: sellerId,
          action: AuditAction.LISTING_PRICE_CHANGED,
          entityType: 'listing',
          entityId: listingId,
          metadata: { from: listing.price.toString(), to: String(dto.price) },
          ipAddress: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        });
      }

      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Photos
  // -------------------------------------------------------------------------

  async addPhoto(
    sellerId: string,
    listingId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ id: string; url: string; sortOrder: number }> {
    const listing = await this.assertOwnedBySeller(listingId, sellerId);
    this.assertEditable(listing);

    const existingCount = await this.prisma.listingPhoto.count({ where: { listingId } });
    if (existingCount >= MAX_PHOTOS) {
      throw new BadRequestException(`A listing may have at most ${MAX_PHOTOS} photos.`);
    }

    const photo = validatePhoto(file);

    // Key is generated, never derived from the client filename, so a hostile
    // name cannot influence where the object lands.
    const key = `listings/${listingId}/photos/${randomUUID()}.${photo.extension}`;

    await this.storage.put({
      bucket: 'public',
      key,
      body: photo.buffer,
      contentType: photo.mimeType,
    });

    const created = await this.prisma.listingPhoto.create({
      data: {
        listingId,
        storageKey: key,
        sortOrder: existingCount,
        sizeBytes: photo.sizeBytes,
      },
    });

    return {
      id: created.id,
      url: this.storage.publicUrl(key),
      sortOrder: created.sortOrder,
    };
  }

  async deletePhoto(sellerId: string, listingId: string, photoId: string): Promise<void> {
    const listing = await this.assertOwnedBySeller(listingId, sellerId);
    this.assertEditable(listing);

    const photo = await this.prisma.listingPhoto.findFirst({
      where: { id: photoId, listingId },
    });

    if (!photo) {
      throw new NotFoundException('Photo not found.');
    }

    await this.prisma.listingPhoto.delete({ where: { id: photo.id } });

    // Storage cleanup is best-effort: an orphaned object costs a fraction of a
    // paisa, while failing the request over it would confuse the seller.
    try {
      await this.storage.delete('public', photo.storageKey);
    } catch (error) {
      this.logger.warn(
        `Orphaned storage object ${photo.storageKey}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Submission
  // -------------------------------------------------------------------------

  /**
   * Submits a listing for human verification.
   *
   * Everything checked here is a precondition for a verifier being able to do
   * their job. Rejecting incomplete submissions at this boundary keeps the review
   * queue meaningful — an ops team working through listings that cannot possibly
   * be approved is the fastest way to blow the 24-hour SLA.
   */
  /**
   * Sets the display order of a listing's photos. The first is the cover.
   *
   * Deliberately NOT gated by `assertEditable`, unlike adding and deleting.
   * Reordering changes only presentation — no claim about the property changes,
   * and every photograph an officer reviewed is still there. Adding or removing
   * photographs after verification would change *what was checked*, which is
   * the swap-behind-the-badge problem the editable rule exists to prevent.
   */
  async reorderPhotos(
    sellerId: string,
    listingId: string,
    order: string[],
  ): Promise<Array<{ id: string; url: string; sortOrder: number }>> {
    await this.assertOwnedBySeller(listingId, sellerId);

    const existing = await this.prisma.listingPhoto.findMany({
      where: { listingId },
      select: { id: true, storageKey: true },
    });

    /*
     * The submitted order must be the complete set. A partial list would leave
     * the omitted photos with stale positions, silently colliding with the new
     * ones — and a list containing an id from another listing would let a
     * seller probe for photo ids that are not theirs.
     */
    const known = new Set(existing.map((photo) => photo.id));
    if (order.length !== existing.length || order.some((id) => !known.has(id))) {
      throw new BadRequestException(
        'Send every photo on this listing exactly once, in the order you want them shown.',
      );
    }

    const keyById = new Map(existing.map((photo) => [photo.id, photo.storageKey]));

    await this.prisma.$transaction(
      order.map((id, index) =>
        this.prisma.listingPhoto.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return order.map((id, index) => ({
      id,
      url: this.storage.publicUrl(keyById.get(id)!),
      sortOrder: index,
    }));
  }

  async submit(sellerId: string, listingId: string, ctx: RequestContext): Promise<Listing> {
    const listing = await this.assertOwnedBySeller(listingId, sellerId);

    if (listing.status === ListingStatus.PENDING_REVIEW) {
      throw new BadRequestException('This listing is already awaiting review.');
    }
    this.assertEditable(listing);

    const seller = await this.prisma.user.findUniqueOrThrow({
      where: { id: sellerId },
      select: { phone: true, isPhoneVerified: true, sellerKind: true, reraNumber: true },
    });

    /**
     * A contactable phone number is the whole point of a lead, and the PRD
     * requires it to be *verified* — not merely typed in.
     *
     * This used to accept any number on the profile, because one-time codes had
     * no delivery path. They do now, so the check is the stricter one: an
     * unverified number is a number nobody has proved they hold, which is
     * exactly the gap a fraudulent listing would use.
     */
    if (!seller.phone) {
      throw new BadRequestException(
        'Add a phone number to your profile before submitting a listing.',
      );
    }

    if (!seller.isPhoneVerified) {
      throw new BadRequestException(
        'Verify your phone number before submitting a listing. Buyers reach you on this number.',
      );
    }

    if (seller.sellerKind === 'BROKER' && !seller.reraNumber) {
      throw new BadRequestException('Brokers must record a RERA registration number.');
    }

    const photoCount = await this.prisma.listingPhoto.count({ where: { listingId } });
    if (photoCount < MIN_PHOTOS) {
      throw new BadRequestException(
        `At least ${MIN_PHOTOS} photos are required (currently ${photoCount}).`,
      );
    }

    const documents = await this.prisma.document.findMany({
      where: { listingId, deletedAt: null },
      select: { kind: true },
    });
    const present = new Set(documents.map((d) => d.kind));
    const missing = REQUIRED_DOCUMENT_KINDS.filter((kind) => !present.has(kind));

    if (missing.length > 0) {
      throw new BadRequestException({
        message: 'Required documents are missing.',
        errors: missing.map((kind) => ({ field: 'documents', message: this.documentLabel(kind) })),
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const submitted = await tx.listing.update({
        where: { id: listingId },
        data: {
          status: ListingStatus.PENDING_REVIEW,
          submittedAt: new Date(),
          rejectionReason: null,
          revisionNote: null,
        },
      });

      await this.audit.recordInTransaction(tx, {
        actorId: sellerId,
        action: AuditAction.LISTING_SUBMITTED,
        entityType: 'listing',
        entityId: listingId,
        metadata: { photoCount, documentKinds: [...present] },
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      return submitted;
    });
  }

  /**
   * Seller re-affirms the property is still available.
   *
   * Directly targets the most common complaint about incumbent portals — sold
   * properties left listed for months. Deliberately separate from `updatedAt`,
   * which any edit would touch.
   */
  async confirmAvailability(sellerId: string, listingId: string): Promise<{ lastConfirmedAt: Date }> {
    await this.assertOwnedBySeller(listingId, sellerId);

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { lastConfirmedAt: new Date() },
      select: { lastConfirmedAt: true },
    });

    // Non-null because we just set it.
    return { lastConfirmedAt: updated.lastConfirmedAt! };
  }

  // -------------------------------------------------------------------------
  // Taking a listing off the market
  // -------------------------------------------------------------------------

  /**
   * Hides a live listing without ending it.
   *
   * Only an APPROVED listing can be paused — nothing else is visible to a buyer,
   * so there is nothing to hide.
   */
  async pause(
    sellerId: string,
    listingId: string,
    reason: string | undefined,
    ctx: RequestContext,
  ): Promise<Listing> {
    const listing = await this.assertOwnedBySeller(listingId, sellerId);

    if (listing.status !== ListingStatus.APPROVED) {
      throw new BadRequestException(
        listing.status === ListingStatus.PAUSED
          ? 'This listing is already paused.'
          : 'Only a live listing can be paused.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const paused = await tx.listing.update({
        where: { id: listingId },
        data: { status: ListingStatus.PAUSED, pausedReason: reason ?? null },
      });

      await this.audit.recordInTransaction(tx, {
        actorId: sellerId,
        action: AuditAction.LISTING_PAUSED,
        entityType: 'listing',
        entityId: listingId,
        metadata: { reason: reason ?? null },
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      return paused;
    });
  }

  /**
   * Puts a paused listing back.
   *
   * Deliberately does NOT re-queue it for verification. Nothing about the
   * property changed while it was away, so the documents an officer already
   * checked still describe it — and making a seller wait through another review
   * would tax the exact behaviour we want, which is taking a listing down
   * promptly rather than leaving a stale one up.
   *
   * `isVerified` is untouched for the same reason: the badge records that a
   * human checked these documents against this property, and that remains true.
   */
  async resume(sellerId: string, listingId: string, ctx: RequestContext): Promise<Listing> {
    const listing = await this.assertOwnedBySeller(listingId, sellerId);

    if (listing.status !== ListingStatus.PAUSED) {
      throw new BadRequestException('Only a paused listing can be put back.');
    }

    return this.prisma.$transaction(async (tx) => {
      const resumed = await tx.listing.update({
        where: { id: listingId },
        data: {
          status: ListingStatus.APPROVED,
          pausedReason: null,
          // Putting it back is itself an assertion that it is available again,
          // so the public "confirmed N days ago" signal starts afresh.
          lastConfirmedAt: new Date(),
        },
      });

      await this.audit.recordInTransaction(tx, {
        actorId: sellerId,
        action: AuditAction.LISTING_RESUMED,
        entityType: 'listing',
        entityId: listingId,
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      return resumed;
    });
  }

  /**
   * Records that the property sold.
   *
   * Terminal, and it tidies up after itself: anyone with an open request to
   * visit is told, rather than being left to turn up at a property that is no
   * longer for sale. A request going quiet is the complaint buyers make most
   * about the incumbents, and selling is no excuse for it.
   */
  async markSold(
    sellerId: string,
    listingId: string,
    dto: MarkSoldDto,
    ctx: RequestContext,
  ): Promise<Listing> {
    const listing = await this.assertOwnedBySeller(listingId, sellerId);

    if (listing.status === ListingStatus.SOLD) {
      throw new BadRequestException('This listing is already marked sold.');
    }

    // A listing that never went live cannot have sold through this platform,
    // and letting a draft jump straight to SOLD would corrupt every figure
    // derived from the sale record.
    if (
      listing.status !== ListingStatus.APPROVED &&
      listing.status !== ListingStatus.PAUSED
    ) {
      throw new BadRequestException(
        'Only a live or paused listing can be marked sold.',
      );
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const sold = await tx.listing.update({
        where: { id: listingId },
        data: {
          status: ListingStatus.SOLD,
          soldAt: now,
          soldPrice: dto.soldPrice === undefined ? null : new Prisma.Decimal(dto.soldPrice),
          soldThroughPlatform: dto.soldThroughPlatform ?? null,
          pausedReason: null,
        },
      });

      /*
       * Close anything still open. CANCELLED rather than DECLINED: the seller is
       * not turning this buyer down, the property has gone — and the note says
       * so, because "cancelled" on its own tells them nothing.
       */
      const closed = await tx.siteVisitRequest.updateMany({
        where: {
          listingId,
          status: { in: [SiteVisitStatus.REQUESTED, SiteVisitStatus.RESCHEDULED, SiteVisitStatus.CONFIRMED] },
        },
        data: {
          status: SiteVisitStatus.CANCELLED,
          sellerNote: 'This property has been sold.',
        },
      });

      await this.audit.recordInTransaction(tx, {
        actorId: sellerId,
        action: AuditAction.LISTING_SOLD,
        entityType: 'listing',
        entityId: listingId,
        metadata: {
          // The price is recorded in the audit trail as well, because it is the
          // one figure here that can never be reconstructed after the fact.
          soldPrice: dto.soldPrice ?? null,
          soldThroughPlatform: dto.soldThroughPlatform ?? null,
          askingPrice: listing.price.toString(),
          visitsCancelled: closed.count,
        },
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      return sold;
    });
  }

  // -------------------------------------------------------------------------
  // Seller views
  // -------------------------------------------------------------------------

  /**
   * The seller's own listings, any status.
   *
   * Includes view and lead counts — the feedback loop that keeps a seller
   * engaged. These numbers are shown to the seller only; public view counts are
   * withheld until inventory is dense enough that a low count does not make a
   * listing look dead.
   */
  async listMine(sellerId: string) {
    return this.prisma.listing.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        price: true,
        status: true,
        isVerified: true,
        firstListedAt: true,
        lastConfirmedAt: true,
        submittedAt: true,
        verifiedAt: true,
        rejectionReason: true,
        revisionNote: true,
        viewsCount: true,
        leadsCount: true,
        createdAt: true,
        property: {
          select: {
            address: true,
            propertyType: true,
            bedrooms: true,
            areaSqft: true,
            neighborhood: { select: { name: true, city: true } },
          },
        },
        _count: { select: { photos: true, documents: true } },
      },
    });
  }

  async getMine(sellerId: string, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, sellerId },
      include: {
        property: { include: { neighborhood: true } },
        photos: { orderBy: { sortOrder: 'asc' } },
        documents: {
          where: { deletedAt: null },
          select: {
            id: true,
            kind: true,
            idProofKind: true,
            originalFilename: true,
            sizeBytes: true,
            createdAt: true,
            // storageKey and the encryption parameters are staff-only and are
            // never returned to a seller.
          },
        },
        priceHistory: { orderBy: { changedAt: 'desc' } },
        verifications: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            decision: true,
            reason: true,
            createdAt: true,
            checks: { select: { kind: true, passed: true, note: true } },
            // internalNotes deliberately omitted — admin-only.
          },
        },
      },
    });

    if (!listing) {
      // Same response as a listing owned by someone else, so this endpoint
      // cannot be used to probe which listing ids exist.
      throw new NotFoundException('Listing not found.');
    }

    return {
      ...listing,
      photos: listing.photos.map((photo) => ({
        id: photo.id,
        sortOrder: photo.sortOrder,
        url: this.storage.publicUrl(photo.storageKey),
      })),
      // Seller-facing only. Buyers are never shown a score — it would read as a
      // quality rating of the property rather than of the paperwork.
      completeness: scoreCompleteness(listing.property),
    };
  }

  /**
   * Performance figures for a seller's own listings.
   *
   * Three numbers a seller actually acts on: how many people looked, how many
   * shortlisted, and how many made contact. Shortlists matter most — someone
   * who saved a property and did not enquire is interested but hesitating, and
   * that is the gap a price change or better photographs closes.
   *
   * Counts only, never identities. A seller learning *who* shortlisted their
   * property would be a privacy breach and would invite exactly the cold-calling
   * this platform exists to avoid; the buyer chose not to make contact.
   */
  async stats(sellerId: string, days: number) {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const listings = await this.prisma.listing.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        isVerified: true,
        price: true,
        firstListedAt: true,
        photos: {
          select: { storageKey: true },
          orderBy: { sortOrder: 'asc' },
          take: 1,
        },
        property: {
          select: { bedrooms: true, areaSqft: true, neighborhood: { select: { name: true } } },
        },
      },
    });

    if (listings.length === 0) {
      return {
        rangeDays: days,
        totals: { views: 0, saves: 0, leads: 0, live: 0 },
        daily: [],
        listings: [],
      };
    }

    const ids = listings.map((listing) => listing.id);

    /*
     * Grouped aggregates rather than a count per listing. A seller with thirty
     * properties would otherwise mean ninety queries, and the page would get
     * slower the more successful they became.
     */
    const [viewGroups, leadGroups, saveGroups, viewDays, leadRows] = await Promise.all([
      this.prisma.listingView.groupBy({
        by: ['listingId'],
        where: { listingId: { in: ids }, viewedOn: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['listingId'],
        where: { listingId: { in: ids }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.savedListing.groupBy({
        by: ['listingId'],
        where: { listingId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.listingView.groupBy({
        by: ['viewedOn'],
        where: { listingId: { in: ids }, viewedOn: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.lead.findMany({
        where: { listingId: { in: ids }, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    const viewsById = new Map(viewGroups.map((row) => [row.listingId, row._count._all]));
    const leadsById = new Map(leadGroups.map((row) => [row.listingId, row._count._all]));
    // Saves are a running total, not windowed: a shortlist from six weeks ago is
    // still a person holding this property in mind.
    const savesById = new Map(saveGroups.map((row) => [row.listingId, row._count._all]));

    // --- Daily series -------------------------------------------------------
    const dayKey = (date: Date): string => date.toISOString().slice(0, 10);
    const viewsByDay = new Map(viewDays.map((row) => [dayKey(row.viewedOn), row._count._all]));

    const leadsByDay = new Map<string, number>();
    for (const lead of leadRows) {
      const key = dayKey(lead.createdAt);
      leadsByDay.set(key, (leadsByDay.get(key) ?? 0) + 1);
    }

    /*
     * Every day in the window is emitted, including empty ones. A chart drawn
     * only from days that had traffic silently compresses the quiet stretches
     * and makes a flat week look busy.
     */
    const daily: Array<{ date: string; views: number; leads: number }> = [];
    for (let offset = 0; offset < days; offset += 1) {
      const day = new Date(since);
      day.setUTCDate(day.getUTCDate() + offset);
      const key = dayKey(day);
      daily.push({
        date: key,
        views: viewsByDay.get(key) ?? 0,
        leads: leadsByDay.get(key) ?? 0,
      });
    }

    const perListing = listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      status: listing.status,
      isVerified: listing.isVerified,
      price: Number(listing.price),
      firstListedAt: listing.firstListedAt,
      locality: listing.property.neighborhood.name,
      bedrooms: listing.property.bedrooms,
      areaSqft: listing.property.areaSqft,
      photo: listing.photos[0] ? this.storage.publicUrl(listing.photos[0].storageKey) : null,
      views: viewsById.get(listing.id) ?? 0,
      saves: savesById.get(listing.id) ?? 0,
      leads: leadsById.get(listing.id) ?? 0,
    }));

    return {
      rangeDays: days,
      totals: {
        views: perListing.reduce((sum, item) => sum + item.views, 0),
        saves: perListing.reduce((sum, item) => sum + item.saves, 0),
        leads: perListing.reduce((sum, item) => sum + item.leads, 0),
        live: listings.filter(
          (listing) => listing.status === ListingStatus.APPROVED && listing.isVerified,
        ).length,
      },
      daily,
      listings: perListing,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Loads a listing and proves the caller owns it.
   *
   * Every seller-scoped mutation routes through here. Returning NotFound rather
   * than Forbidden for someone else's listing avoids confirming that the id
   * exists.
   */
  private async assertOwnedBySeller(listingId: string, sellerId: string): Promise<Listing> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });

    if (!listing || listing.sellerId !== sellerId) {
      throw new NotFoundException('Listing not found.');
    }

    return listing;
  }

  private assertEditable(listing: Listing): void {
    if (!EDITABLE_STATUSES.includes(listing.status)) {
      throw new ForbiddenException(
        `A listing with status ${listing.status} cannot be edited. Approved listings must be re-reviewed after changes.`,
      );
    }
  }

  private documentLabel(kind: DocumentKind): string {
    switch (kind) {
      case DocumentKind.SALE_DEED:
        return 'Sale deed is required';
      case DocumentKind.ID_PROOF:
        return 'Identity proof is required';
      case DocumentKind.PROPERTY_TAX_RECEIPT:
        return 'Property tax receipt is required';
      default:
        return `${kind} is required`;
    }
  }
}
