import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LeadStatus,
  publicListingWhere,
  publicProjectWhere,
  ReportStatus,
  SiteVisitStatus,
} from '@kamala/db';

import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import type { RequestContext } from '../auth/auth.service';
import type {
  CreateSiteVisitDto,
  RespondSiteVisitDto,
  CreateLeadDto,
  CreateProjectLeadDto,
  CreateReportDto,
  ResolveReportDto,
  UpdateLeadStatusDto,
} from './leads.dto';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // -------------------------------------------------------------------------
  // Leads
  // -------------------------------------------------------------------------

  /**
   * Buyer contacts the owner of a verified listing.
   *
   * A lead can only be created against a publicly visible listing — composed
   * from the shared visibility rule, so nobody can submit enquiries against a
   * draft or rejected listing to probe whether it exists.
   */
  async createLead(
    listingId: string,
    dto: CreateLeadDto,
    buyerId: string | undefined,
    ctx: RequestContext,
  ): Promise<{ id: string; submitted: true }> {
    const listing = await this.prisma.listing.findFirst({
      where: publicListingWhere({ id: listingId }),
      select: {
        id: true,
        title: true,
        seller: { select: { id: true, email: true, fullName: true } },
      },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found.');
    }

    const lead = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          listingId,
          buyerId: buyerId ?? null,
          name: dto.name,
          phone: dto.phone,
          email: dto.email ?? null,
          message: [dto.message, dto.preferredTime ? `Preferred time: ${dto.preferredTime}` : null]
            .filter(Boolean)
            .join('\n\n') || null,
          status: LeadStatus.NEW,
        },
      });

      await tx.listing.update({
        where: { id: listingId },
        data: { leadsCount: { increment: 1 } },
      });

      return created;
    });

    /**
     * The seller is notified that an enquiry arrived, and by whom — but the
     * buyer's phone number is NOT put in the email. It is shown in the seller's
     * dashboard, behind authentication.
     *
     * This is the platform's core promise made operational: a buyer's number is
     * visible to exactly one seller, in one place, and is never bulk-exported or
     * sold. "Data shared with brokers within hours" is the single most common
     * complaint about every incumbent.
     */
    await this.mail.send({
      to: listing.seller.email,
      subject: `New enquiry on ${listing.title}`,
      text: `Hello ${listing.seller.fullName},\n\n${dto.name} has enquired about "${listing.title}".\n\nOpen your dashboard to see their contact details and respond:\n${this.config.getOrThrow<string>('APP_PUBLIC_URL')}/seller/leads\n\n— SellEasy24`,
    });

    await this.audit.record({
      actorId: buyerId ?? null,
      action: AuditAction.LEAD_CREATED,
      entityType: 'lead',
      entityId: lead.id,
      // Records that an enquiry happened and on which listing. The buyer's name,
      // phone and message are NOT duplicated into the audit trail — they already
      // live on the lead row, and copying PII widens the exposure surface.
      metadata: { listingId },
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    // The lead id is returned so the buyer's client can show a reference.
    return { id: lead.id, submitted: true };
  }

  /**
   * The seller's lead inbox.
   *
   * Scoped by listing ownership, so a seller sees enquiries on their own
   * listings and nobody else's. This is the only place a buyer's phone number is
   * exposed.
   */
  async listLeadsForSeller(sellerId: string) {
    return this.prisma.lead.findMany({
      /*
       * Both kinds in one query, scoped to whatever this account owns. A lead
       * carries exactly one of the two targets, so the OR cannot double-count.
       *
       * One inbox rather than two endpoints because a builder with resale stock
       * and a project should not have to look in two places to find out who is
       * trying to reach them.
       */
      where: {
        OR: [{ listing: { sellerId } }, { project: { builderId: sellerId } }],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        message: true,
        status: true,
        contactedAt: true,
        createdAt: true,
        listing: { select: { id: true, title: true } },
        project: { select: { id: true, name: true } },
        // Which configuration they asked about — the first thing a builder's
        // sales team wants to know, and useless to them if not recorded.
        projectUnit: {
          select: { id: true, bedrooms: true, areaSqft: true, priceFrom: true },
        },
      },
    });
  }

  /**
   * A buyer enquiring about a builder project.
   *
   * Deliberately parallel to `createLead` rather than folded into it: the two
   * resolve ownership differently, notify different people, and a project
   * enquiry may name a configuration. A single method taking an optional
   * project would be a tangle of branches on every line.
   *
   * The privacy rule is identical and not negotiable — the builder is told an
   * enquiry arrived and by whom, and the buyer's number appears only in their
   * dashboard, behind authentication.
   */
  async createProjectLead(
    projectId: string,
    dto: CreateProjectLeadDto,
    buyerId: string | undefined,
    ctx: RequestContext,
  ): Promise<{ id: string; submitted: true }> {
    const project = await this.prisma.project.findFirst({
      where: publicProjectWhere({ id: projectId }),
      select: {
        id: true,
        name: true,
        builder: { select: { id: true, email: true, fullName: true } },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    /*
     * A configuration from another project would attach the enquiry to
     * something the builder never offered here, so it is checked against this
     * project rather than merely for existence.
     */
    let unitLabel: string | null = null;
    if (dto.projectUnitId) {
      const unit = await this.prisma.projectUnit.findFirst({
        where: { id: dto.projectUnitId, projectId },
        select: { bedrooms: true },
      });

      if (!unit) {
        throw new BadRequestException('That configuration is not part of this project.');
      }
      unitLabel = `${unit.bedrooms} BHK`;
    }

    const lead = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          projectId,
          projectUnitId: dto.projectUnitId ?? null,
          buyerId: buyerId ?? null,
          name: dto.name,
          phone: dto.phone,
          email: dto.email ?? null,
          message: dto.message ?? null,
          status: LeadStatus.NEW,
        },
      });

      await tx.project.update({
        where: { id: projectId },
        data: { leadsCount: { increment: 1 } },
      });

      return created;
    });

    // Same rule as a listing enquiry: who got in touch, never their number.
    await this.mail.send({
      to: project.builder.email,
      subject: `New enquiry on ${project.name}`,
      text: `Hello ${project.builder.fullName},\n\n${dto.name} has enquired about "${project.name}"${
        unitLabel ? `, asking about the ${unitLabel}` : ''
      }.\n\nOpen your dashboard to see their contact details and respond:\n${this.config.getOrThrow<string>('APP_PUBLIC_URL')}/seller/leads\n\n— SellEasy24`,
    });

    await this.audit.record({
      actorId: buyerId ?? null,
      action: AuditAction.LEAD_CREATED,
      entityType: 'lead',
      entityId: lead.id,
      // What was enquired about, never who by — the name, number and message
      // already live on the lead row, and copying them widens the exposure.
      metadata: { projectId, projectUnitId: dto.projectUnitId ?? null },
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return { id: lead.id, submitted: true };
  }

  async updateLeadStatus(
    sellerId: string,
    leadId: string,
    dto: UpdateLeadStatusDto,
  ): Promise<{ id: string; status: LeadStatus }> {
    /*
     * Ownership proven in the query itself — no fetch-then-check gap. Either
     * side of the OR is enough: the caller owns the listing the lead is on, or
     * they own the project. A lead has exactly one of the two.
     */
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        OR: [{ listing: { sellerId } }, { project: { builderId: sellerId } }],
      },
      select: { id: true, contactedAt: true },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found.');
    }

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: dto.status,
        // Stamped once, on the first move away from NEW. Feeds the
        // "average response time" metric the PRD tracks.
        ...(lead.contactedAt === null &&
          dto.status !== LeadStatus.NEW && { contactedAt: new Date() }),
      },
      select: { id: true, status: true },
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------------

  /**
   * Report a listing.
   *
   * Open to anonymous users on purpose: requiring an account to report a fake
   * listing suppresses exactly the signal we most want. The returned id is the
   * reporter's ticket reference — every incumbent is criticised for complaints
   * that vanish with no way to follow up.
   */
  async createReport(
    listingId: string,
    dto: CreateReportDto,
    reporterId: string | undefined,
    ctx: RequestContext,
  ): Promise<{ id: string; status: ReportStatus }> {
    // Reportable if publicly visible — you cannot report what you cannot see.
    const listing = await this.prisma.listing.findFirst({
      where: publicListingWhere({ id: listingId }),
      select: { id: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found.');
    }

    const report = await this.prisma.listingReport.create({
      data: {
        listingId,
        reporterId: reporterId ?? null,
        reason: dto.reason,
        details: dto.details ?? null,
        status: ReportStatus.OPEN,
      },
      select: { id: true, status: true },
    });

    await this.audit.record({
      actorId: reporterId ?? null,
      action: AuditAction.REPORT_FILED,
      entityType: 'listing_report',
      entityId: report.id,
      metadata: { listingId, reason: dto.reason },
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return report;
  }

  /**
   * Ticket status lookup.
   *
   * Public, keyed by the unguessable report id. Returns status and resolution
   * note only — never the reporter's identity or internal handling detail.
   */
  async getReportStatus(reportId: string) {
    const report = await this.prisma.listingReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        reason: true,
        status: true,
        resolutionNote: true,
        createdAt: true,
        resolvedAt: true,
      },
    });

    if (!report) {
      throw new NotFoundException('Report not found.');
    }

    return report;
  }

  /** Moderation queue, oldest open reports first. */
  async listReports(status?: ReportStatus) {
    return this.prisma.listingReport.findMany({
      where: status ? { status } : { status: { in: [ReportStatus.OPEN, ReportStatus.IN_REVIEW] } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        reason: true,
        details: true,
        status: true,
        createdAt: true,
        listing: {
          select: {
            id: true,
            title: true,
            status: true,
            seller: { select: { id: true, fullName: true } },
          },
        },
        reporter: { select: { id: true, email: true } },
      },
    });
  }

  async resolveReport(
    staffId: string,
    reportId: string,
    dto: ResolveReportDto,
    ctx: RequestContext,
  ) {
    const report = await this.prisma.listingReport.findUnique({
      where: { id: reportId },
      select: { id: true, listingId: true },
    });

    if (!report) {
      throw new NotFoundException('Report not found.');
    }

    const isTerminal = dto.status === 'RESOLVED' || dto.status === 'DISMISSED';

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.listingReport.update({
        where: { id: report.id },
        data: {
          status: ReportStatus[dto.status],
          resolutionNote: dto.resolutionNote,
          resolvedById: staffId,
          resolvedAt: isTerminal ? new Date() : null,
        },
        select: { id: true, status: true, resolutionNote: true, resolvedAt: true },
      });

      await this.audit.recordInTransaction(tx, {
        actorId: staffId,
        action: AuditAction.REPORT_RESOLVED,
        entityType: 'listing_report',
        entityId: report.id,
        metadata: { listingId: report.listingId, status: dto.status },
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      return result;
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Site visits
  // -------------------------------------------------------------------------

  /**
   * A buyer asks to see a property.
   *
   * Requires an account, unlike reporting a listing. Arranging to meet someone
   * at a property is a real-world commitment, and a seller clearing their
   * Saturday for an anonymous request that never turns up is exactly the
   * time-wasting the incumbents are criticised for.
   */
  async createSiteVisit(
    listingId: string,
    dto: CreateSiteVisitDto,
    buyerId: string,
    ctx: RequestContext,
  ): Promise<{ id: string; status: SiteVisitStatus }> {
    const listing = await this.prisma.listing.findFirst({
      where: publicListingWhere({ id: listingId }),
      select: {
        id: true,
        title: true,
        sellerId: true,
        seller: { select: { email: true, fullName: true } },
      },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found.');
    }

    if (listing.sellerId === buyerId) {
      throw new BadRequestException('You cannot request a visit to your own listing.');
    }

    /*
     * One open request per buyer per listing. Without this, repeatedly
     * submitting the form fills the seller's inbox with the same person asking
     * the same thing, and there is no single row to confirm against.
     */
    const existing = await this.prisma.siteVisitRequest.findFirst({
      where: {
        listingId,
        buyerId,
        status: { in: [SiteVisitStatus.REQUESTED, SiteVisitStatus.RESCHEDULED] },
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException(
        'You already have a visit request open on this property. Wait for the seller to respond.',
      );
    }

    const created = await this.prisma.siteVisitRequest.create({
      data: {
        listingId,
        buyerId,
        preferredAt: dto.preferredAt,
        note: dto.note ?? null,
        status: SiteVisitStatus.REQUESTED,
      },
      select: { id: true, status: true },
    });

    // Same rule as enquiries: the seller is told a request arrived, not given
    // the buyer's contact details by email. Those live behind authentication.
    await this.mail.send({
      to: listing.seller.email,
      subject: `Visit request for ${listing.title}`,
      text: `Hello ${listing.seller.fullName},

Someone has asked to visit "${listing.title}".

Open your dashboard to see the requested time and respond:
${this.config.getOrThrow<string>('APP_PUBLIC_URL')}/seller/visits

— SellEasy24`,
    });

    await this.audit.record({
      actorId: buyerId,
      action: AuditAction.LEAD_CREATED,
      entityType: 'site_visit_request',
      entityId: created.id,
      metadata: { listingId },
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return created;
  }

  /** The seller's visit inbox, across all their listings. */
  async listSiteVisitsForSeller(sellerId: string) {
    return this.prisma.siteVisitRequest.findMany({
      where: { listing: { sellerId } },
      orderBy: [{ status: 'asc' }, { preferredAt: 'asc' }],
      select: {
        id: true,
        status: true,
        preferredAt: true,
        proposedAt: true,
        confirmedAt: true,
        note: true,
        sellerNote: true,
        createdAt: true,
        listing: { select: { id: true, title: true } },
        // The buyer's contact details, shown only here — behind the seller's
        // own authentication, on their own listing.
        buyer: { select: { fullName: true, phone: true, email: true } },
      },
    });
  }

  /** A buyer's own requests, so they can see where each one stands. */
  async listSiteVisitsForBuyer(buyerId: string) {
    return this.prisma.siteVisitRequest.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        preferredAt: true,
        proposedAt: true,
        confirmedAt: true,
        // Their own note, echoed back so they can see what they asked for.
        note: true,
        sellerNote: true,
        createdAt: true,
        listing: { select: { id: true, title: true } },
      },
    });
  }

  /**
   * The seller confirms, proposes another time, or declines.
   *
   * Ownership is proven through the listing relation in the same query, so
   * there is no fetch-then-check gap a concurrent request could slip through.
   */
  async respondToSiteVisit(
    sellerId: string,
    requestId: string,
    dto: RespondSiteVisitDto,
  ) {
    const request = await this.prisma.siteVisitRequest.findFirst({
      where: { id: requestId, listing: { sellerId } },
      select: { id: true, status: true, preferredAt: true },
    });

    if (!request) {
      throw new NotFoundException('Visit request not found.');
    }

    if (
      request.status === SiteVisitStatus.CANCELLED ||
      request.status === SiteVisitStatus.COMPLETED
    ) {
      throw new BadRequestException('This request is already closed.');
    }

    const data =
      dto.decision === 'CONFIRM'
        ? {
            status: SiteVisitStatus.CONFIRMED,
            // Confirming the buyer's slot unless the seller supplied another.
            confirmedAt: dto.proposedAt ?? request.preferredAt,
          }
        : dto.decision === 'RESCHEDULE'
          ? { status: SiteVisitStatus.RESCHEDULED, proposedAt: dto.proposedAt! }
          : { status: SiteVisitStatus.DECLINED };

    return this.prisma.siteVisitRequest.update({
      where: { id: request.id },
      data: { ...data, sellerNote: dto.sellerNote ?? null },
      select: {
        id: true,
        status: true,
        preferredAt: true,
        proposedAt: true,
        confirmedAt: true,
        sellerNote: true,
      },
    });
  }
}
