import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DocumentKind, ListingStatus, Prisma, type Listing } from '@kamala/db';
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
