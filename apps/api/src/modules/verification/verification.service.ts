import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ListingStatus,
  PUBLIC_LISTING_WHERE,
  VerificationDecision,
  type Role,
} from '@kamala/db';

import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { Env } from '../../config/env.schema';
import type { RequestContext } from '../auth/auth.service';
import { DocumentsService, type DocumentContent } from '../listings/documents.service';
import { CHECK_LABELS, type DecideDto, type QueueQueryDto } from './verification.dto';

/** Review SLA from the PRD. Drives queue ageing, not enforcement. */
const SLA_HOURS = 24;

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // -------------------------------------------------------------------------
  // Queue
  // -------------------------------------------------------------------------

  /**
   * Pending listings, oldest first.
   *
   * Oldest-first is deliberate and matches the PRD. Any other ordering — newest
   * first, or "premium first" — lets the oldest submissions starve, which is how
   * incumbents end up with month-old unreviewed listings.
   */
  async queue(query: QueueQueryDto) {
    const where = { status: ListingStatus.PENDING_REVIEW };

    const [total, rows, overdue] = await Promise.all([
      this.prisma.listing.count({ where }),
      this.prisma.listing.findMany({
        where,
        orderBy: { submittedAt: 'asc' },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          title: true,
          price: true,
          submittedAt: true,
          createdAt: true,
          seller: { select: { id: true, fullName: true, sellerKind: true, reraNumber: true } },
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
      }),
      this.prisma.listing.count({
        where: {
          ...where,
          submittedAt: { lt: new Date(Date.now() - SLA_HOURS * 3_600_000) },
        },
      }),
    ]);

    const now = Date.now();

    return {
      total,
      // Surfaced so the ops team sees SLA breaches without reading timestamps.
      // Queue depth and age are business alerts, not infrastructure metrics.
      overdue,
      slaHours: SLA_HOURS,
      items: rows.map((row) => {
        const waitingHours = row.submittedAt
          ? Math.floor((now - row.submittedAt.getTime()) / 3_600_000)
          : 0;
        return { ...row, waitingHours, slaBreached: waitingHours >= SLA_HOURS };
      }),
    };
  }

  /**
   * Full listing detail for review.
   *
   * Returns document *metadata* only — never bytes and never storage keys. The
   * verifier fetches each document through readDocument(), which authorises and
   * logs the access individually.
   */
  async getForReview(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        property: { include: { neighborhood: true } },
        photos: { orderBy: { sortOrder: 'asc' } },
        seller: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            sellerKind: true,
            reraNumber: true,
            isEmailVerified: true,
            createdAt: true,
            // Rejection history is a fraud signal the verifier should see.
            _count: { select: { listings: true } },
          },
        },
        documents: {
          where: { deletedAt: null },
          select: {
            id: true,
            kind: true,
            idProofKind: true,
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        priceHistory: { orderBy: { changedAt: 'desc' } },
        verifications: {
          orderBy: { createdAt: 'desc' },
          include: { checks: true, verifier: { select: { id: true, fullName: true } } },
        },
      },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found.');
    }

    return {
      ...listing,
      photos: listing.photos.map((p) => ({
        id: p.id,
        sortOrder: p.sortOrder,
        url: this.storage.publicUrl(p.storageKey),
      })),
    };
  }

  /**
   * Decrypts and returns a document for staff review.
   *
   * Note this streams through the API rather than issuing a presigned URL.
   * Because documents are encrypted at the application layer, a presigned URL
   * would hand the caller ciphertext — only the API holds the key. The upside is
   * that every byte served passes an authorisation check and is access-logged;
   * the cost is API bandwidth, which is negligible for 10 MB files reviewed once.
   */
  async readDocument(
    staffId: string,
    staffRole: Role,
    documentId: string,
    ctx: RequestContext,
  ): Promise<DocumentContent> {
    return this.documents.readForStaff(staffId, staffRole, documentId, ctx);
  }

  // -------------------------------------------------------------------------
  // Decision
  // -------------------------------------------------------------------------

  async decide(
    verifierId: string,
    listingId: string,
    dto: DecideDto,
    ctx: RequestContext,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { seller: { select: { id: true, email: true, fullName: true } } },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found.');
    }

    if (listing.status !== ListingStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `Only listings awaiting review can be decided. This one is ${listing.status}.`,
      );
    }

    /**
     * Separation of duties: nobody verifies their own listing.
     *
     * Staff can also be sellers, and self-approval would void the entire trust
     * proposition — the one thing buyers are being asked to rely on.
     */
    if (listing.sellerId === verifierId) {
      throw new ForbiddenException(
        'You cannot verify your own listing. Reassign it to another verifier.',
      );
    }

    const approved = dto.decision === VerificationDecision.APPROVED;
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const verification = await tx.verification.create({
        data: {
          listingId,
          verifierId,
          decision: dto.decision,
          reason: dto.reason ?? null,
          internalNotes: dto.internalNotes ?? null,
          checks: {
            create: dto.checks.map((check) => ({
              kind: check.kind,
              passed: check.passed,
              note: check.note ?? null,
            })),
          },
        },
        include: { checks: true },
      });

      const nextStatus = approved
        ? ListingStatus.APPROVED
        : dto.decision === VerificationDecision.REJECTED
          ? ListingStatus.REJECTED
          : // A revision request returns the listing to the seller as an editable
            // draft, carrying the note explaining what to fix.
            ListingStatus.DRAFT;

      const updated = await tx.listing.update({
        where: { id: listingId },
        data: {
          status: nextStatus,
          isVerified: approved,
          verifiedAt: approved ? now : null,
          verifiedById: approved ? verifierId : null,
          rejectionReason: dto.decision === VerificationDecision.REJECTED ? dto.reason : null,
          revisionNote:
            dto.decision === VerificationDecision.REVISION_REQUESTED ? dto.reason : null,

          /**
           * firstListedAt is set ONCE, on first approval, and never again.
           *
           * The conditional spread is the enforcement: a re-approval after an
           * edit leaves the original date intact. This is what makes
           * "listed 3 days ago" honest, and it is the specific behaviour
           * incumbents break by re-posting stale listings as new.
           */
          ...(approved && listing.firstListedAt === null && { firstListedAt: now }),

          // Approval is also a fresh confirmation the property is available.
          ...(approved && { lastConfirmedAt: now }),
        },
      });

      // Written inside the transaction: an unaudited approval is not acceptable,
      // so the decision and its audit row commit or fail together.
      await this.audit.recordInTransaction(tx, {
        actorId: verifierId,
        action: approved
          ? AuditAction.LISTING_APPROVED
          : dto.decision === VerificationDecision.REJECTED
            ? AuditAction.LISTING_REJECTED
            : AuditAction.LISTING_REVISION_REQUESTED,
        entityType: 'listing',
        entityId: listingId,
        metadata: {
          verificationId: verification.id,
          decision: dto.decision,
          checks: verification.checks.map((c) => ({ kind: c.kind, passed: c.passed })),
          firstApproval: approved && listing.firstListedAt === null,
        },
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      return { verification, listing: updated };
    });

    // Post-commit side effects. Deliberately outside the transaction: a slow mail
    // provider must not hold a database transaction open, and a failed email must
    // not roll back a completed verification decision.
    await this.documents.scheduleRetention(listingId);
    await this.notifySeller(listing.seller, listing.title, dto, listingId);

    return result;
  }

  // -------------------------------------------------------------------------
  // Public badge detail
  // -------------------------------------------------------------------------

  /**
   * The verification checklist for an approved listing — public, no login.
   *
   * This is a deliberate product decision. MagicBricks blurs public RERA data
   * behind an "Unlock Now" lead-capture wall; gating our own trust signal the
   * same way would undercut the only thing that differentiates this platform.
   * A badge that will not say what it checked is worth less than no badge.
   */
  async publicVerification(listingId: string) {
    // Composed from the shared visibility rule, so an unapproved listing cannot
    // leak its verification history here.
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, ...PUBLIC_LISTING_WHERE },
      select: { id: true, verifiedAt: true, firstListedAt: true, lastConfirmedAt: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found.');
    }

    const verification = await this.prisma.verification.findFirst({
      where: { listingId, decision: VerificationDecision.APPROVED },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        checks: { select: { kind: true, passed: true, note: true } },
        // verifierId and internalNotes are intentionally absent: the buyer needs
        // to know a check happened and when, not which member of staff did it.
      },
    });

    if (!verification) {
      throw new NotFoundException('Verification details not available.');
    }

    return {
      listingId: listing.id,
      verifiedAt: verification.createdAt,
      firstListedAt: listing.firstListedAt,
      lastConfirmedAt: listing.lastConfirmedAt,
      checks: verification.checks.map((check) => ({
        kind: check.kind,
        label: CHECK_LABELS[check.kind],
        passed: check.passed,
        note: check.note,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async notifySeller(
    seller: { email: string; fullName: string },
    listingTitle: string,
    dto: DecideDto,
    listingId: string,
  ): Promise<void> {
    const appUrl = this.config.getOrThrow<string>('APP_PUBLIC_URL');
    const link = `${appUrl}/seller/listings/${listingId}`;

    if (dto.decision === VerificationDecision.APPROVED) {
      await this.mail.send({
        to: seller.email,
        subject: `Your listing is verified and live: ${listingTitle}`,
        text: `Hello ${seller.fullName},\n\nGood news — "${listingTitle}" has passed verification and is now live with the Verified badge.\n\nBuyers can see exactly which checks we completed, which is what makes the badge worth something.\n\nView your listing: ${link}\n\n— SellEasy24`,
      });
      return;
    }

    const isRejection = dto.decision === VerificationDecision.REJECTED;

    await this.mail.send({
      to: seller.email,
      subject: isRejection
        ? `Action needed: ${listingTitle} was not approved`
        : `Action needed: changes requested on ${listingTitle}`,
      text: `Hello ${seller.fullName},\n\n${
        isRejection
          ? `We could not approve "${listingTitle}".`
          : `We need a change before "${listingTitle}" can go live.`
      }\n\nReason:\n${dto.reason ?? 'No reason recorded.'}\n\nYou can edit and resubmit: ${link}\n\n— SellEasy24`,
    });
  }
}
