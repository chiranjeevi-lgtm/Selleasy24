import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeadStatus, publicListingWhere, ReportStatus } from '@kamala/db';

import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import type { RequestContext } from '../auth/auth.service';
import type {
  CreateLeadDto,
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
      where: { listing: { sellerId } },
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
      },
    });
  }

  async updateLeadStatus(
    sellerId: string,
    leadId: string,
    dto: UpdateLeadStatusDto,
  ): Promise<{ id: string; status: LeadStatus }> {
    // Ownership proven through the listing relation in a single query — no
    // fetch-then-check gap.
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, listing: { sellerId } },
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
}
