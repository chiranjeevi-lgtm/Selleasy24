import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ListingStatus,
  ProjectStatus,
  PUBLIC_LISTING_WHERE,
  PUBLIC_PROJECT_WHERE,
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
import { ProjectDocumentsService } from '../projects/project-documents.service';
import { ReferralsService } from '../referrals/referrals.service';
import {
  CHECK_LABELS,
  mandatoryChecksForStage,
  type DecideDto,
  type DecideProjectDto,
  type QueueQueryDto,
} from './verification.dto';

/** Review SLA from the PRD. Drives queue ageing, not enforcement. */
const SLA_HOURS = 24;

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly projectDocuments: ProjectDocumentsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
    private readonly referrals: ReferralsService,
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

    // Referral seller-side qualification, fired on first approval only. The
    // service is idempotent — calling it on a re-approval of an already
    // approved listing (or a seller with no referral) is a no-op. Wrapped in
    // its own try/catch so a referral quirk cannot roll back a completed
    // verification decision.
    if (approved && listing.firstListedAt === null) {
      try {
        await this.referrals.qualifyForSeller(listing.sellerId);
      } catch (error) {
        // Verification is the load-bearing action here; referral qualification
        // sits alongside it. Log and continue.
        const detail = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(`Referral qualifyForSeller failed for ${listing.sellerId}: ${detail}`);
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Builder projects
  // -------------------------------------------------------------------------

  /**
   * Pending projects, oldest first.
   *
   * A separate queue from listings rather than one merged view. The two reviews
   * check different documents against different registers, and interleaving them
   * would mean an officer switching context on every row.
   */
  async projectQueue(query: QueueQueryDto) {
    const where = { status: ProjectStatus.PENDING_REVIEW };

    const [total, rows, overdue] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        orderBy: { submittedAt: 'asc' },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          name: true,
          stage: true,
          reraNumber: true,
          address: true,
          possessionDate: true,
          submittedAt: true,
          createdAt: true,
          builder: { select: { id: true, fullName: true, reraNumber: true } },
          neighborhood: { select: { name: true, city: true } },
          _count: { select: { photos: true, documents: true, units: true } },
        },
      }),
      this.prisma.project.count({
        where: {
          ...where,
          submittedAt: { lt: new Date(Date.now() - SLA_HOURS * 3_600_000) },
        },
      }),
    ]);

    const now = Date.now();

    return {
      total,
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
   * Full project detail for review.
   *
   * Document metadata only, never bytes and never storage keys — the officer
   * fetches each document through readProjectDocument(), which authorises and
   * logs individually.
   */
  async getProjectForReview(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        neighborhood: true,
        units: { orderBy: { priceFrom: 'asc' } },
        photos: { orderBy: { sortOrder: 'asc' } },
        builder: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            reraNumber: true,
            isEmailVerified: true,
            isPhoneVerified: true,
            createdAt: true,
            // How many projects this builder has put through before — the
            // track record an officer should weigh.
            _count: { select: { builderProjects: true } },
          },
        },
        documents: {
          where: { deletedAt: null },
          select: {
            id: true,
            kind: true,
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        verifications: {
          orderBy: { createdAt: 'desc' },
          include: { checks: true, verifier: { select: { id: true, fullName: true } } },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    return {
      ...project,
      photos: project.photos.map((photo) => ({
        id: photo.id,
        sortOrder: photo.sortOrder,
        isRender: photo.isRender,
        url: this.storage.publicUrl(photo.storageKey),
      })),
      // Told to the client so the checklist can render the right rows rather
      // than hard-coding the stage rule in two places.
      requiredChecks: mandatoryChecksForStage(project.stage),
    };
  }

  async readProjectDocument(
    staffId: string,
    staffRole: Role,
    documentId: string,
    ctx: RequestContext,
  ): Promise<DocumentContent> {
    return this.projectDocuments.readForStaff(staffId, staffRole, documentId, ctx);
  }

  async decideProject(
    verifierId: string,
    projectId: string,
    dto: DecideProjectDto,
    ctx: RequestContext,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { builder: { select: { id: true, email: true, fullName: true } } },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    if (project.status !== ProjectStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `Only projects awaiting review can be decided. This one is ${project.status}.`,
      );
    }

    // Separation of duties, same rule as listings: nobody verifies their own.
    if (project.builderId === verifierId) {
      throw new ForbiddenException(
        'You cannot verify your own project. Reassign it to another verifier.',
      );
    }

    const approved = dto.decision === VerificationDecision.APPROVED;

    /*
     * The stage-dependent approval rule, applied here because Zod cannot see
     * which project the body refers to. Same failure mode as the listing rule:
     * a badge granted without the checks behind it is worse than no badge.
     */
    if (approved) {
      const required = mandatoryChecksForStage(project.stage);
      const byKind = new Map(dto.checks.map((check) => [check.kind, check]));
      const problems: string[] = [];

      for (const kind of required) {
        const result = byKind.get(kind);
        if (!result) {
          problems.push(`${CHECK_LABELS[kind]} must be recorded before approval`);
        } else if (!result.passed) {
          problems.push(`Cannot approve: ${CHECK_LABELS[kind]} did not pass`);
        }
      }

      if (problems.length > 0) {
        throw new BadRequestException({
          message: 'This project cannot be approved yet.',
          errors: problems.map((message) => ({ field: 'checks', message })),
        });
      }
    }

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const verification = await tx.verification.create({
        data: {
          projectId,
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
        ? ProjectStatus.APPROVED
        : dto.decision === VerificationDecision.REJECTED
          ? ProjectStatus.REJECTED
          : ProjectStatus.DRAFT;

      const updated = await tx.project.update({
        where: { id: projectId },
        data: {
          status: nextStatus,
          isVerified: approved,
          verifiedAt: approved ? now : null,
          verifiedById: approved ? verifierId : null,
          rejectionReason: dto.decision === VerificationDecision.REJECTED ? dto.reason : null,
          revisionNote:
            dto.decision === VerificationDecision.REVISION_REQUESTED ? dto.reason : null,

          // Set once, on first approval, never again — so "launched N days ago"
          // stays honest across a re-review.
          ...(approved && project.firstListedAt === null && { firstListedAt: now }),
        },
      });

      await this.audit.recordInTransaction(tx, {
        actorId: verifierId,
        action: approved
          ? AuditAction.PROJECT_APPROVED
          : dto.decision === VerificationDecision.REJECTED
            ? AuditAction.PROJECT_REJECTED
            : AuditAction.PROJECT_REVISION_REQUESTED,
        entityType: 'project',
        entityId: projectId,
        metadata: {
          verificationId: verification.id,
          decision: dto.decision,
          stage: project.stage,
          checks: verification.checks.map((c) => ({ kind: c.kind, passed: c.passed })),
          firstApproval: approved && project.firstListedAt === null,
        },
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      return { verification, project: updated };
    });

    // Outside the transaction: a slow mail provider must not hold one open, and
    // a failed email must not roll back a completed decision.
    await this.projectDocuments.scheduleRetention(projectId);
    await this.notifyBuilder(project.builder, project.name, dto, projectId);

    return result;
  }

  /**
   * The verification checklist for an approved project — public, no login.
   *
   * Same reasoning as the listing badge: a badge that will not say what it
   * checked is worth less than no badge.
   */
  async publicProjectVerification(projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ...PUBLIC_PROJECT_WHERE },
      select: { id: true, verifiedAt: true, firstListedAt: true, reraNumber: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    const verification = await this.prisma.verification.findFirst({
      where: { projectId, decision: VerificationDecision.APPROVED },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        checks: { select: { kind: true, passed: true, note: true } },
      },
    });

    if (!verification) {
      throw new NotFoundException('Verification details not available.');
    }

    return {
      projectId: project.id,
      reraNumber: project.reraNumber,
      verifiedAt: verification.createdAt,
      firstListedAt: project.firstListedAt,
      checks: verification.checks.map((check) => ({
        kind: check.kind,
        label: CHECK_LABELS[check.kind],
        passed: check.passed,
        note: check.note,
      })),
    };
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

  private async notifyBuilder(
    builder: { email: string; fullName: string },
    projectName: string,
    dto: DecideProjectDto,
    projectId: string,
  ): Promise<void> {
    const appUrl = this.config.getOrThrow<string>('APP_PUBLIC_URL');
    const link = `${appUrl}/seller/projects/${projectId}`;

    if (dto.decision === VerificationDecision.APPROVED) {
      await this.mail.send({
        to: builder.email,
        subject: `${projectName} is verified and live`,
        text: `Hello ${builder.fullName},\n\n"${projectName}" has passed verification and is now live with the Verified badge.\n\nBuyers can see exactly which checks we completed — the RERA registration, the sanctioned plan, and the land title — which is what makes the badge worth something.\n\nView your project: ${link}\n\n— SellEasy24`,
      });
      return;
    }

    const isRejection = dto.decision === VerificationDecision.REJECTED;

    await this.mail.send({
      to: builder.email,
      subject: isRejection
        ? `Action needed: ${projectName} was not approved`
        : `Action needed: changes requested on ${projectName}`,
      text: `Hello ${builder.fullName},\n\n${
        isRejection
          ? `We could not approve "${projectName}".`
          : `We need a change before "${projectName}" can go live.`
      }\n\nReason:\n${dto.reason ?? 'No reason recorded.'}\n\nYou can edit and resubmit: ${link}\n\n— SellEasy24`,
    });
  }
}
