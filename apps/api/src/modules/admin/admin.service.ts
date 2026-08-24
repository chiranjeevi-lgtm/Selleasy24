import { Injectable } from '@nestjs/common';
import {
  LeadStatus,
  ListingStatus,
  ProjectStatus,
  ReportStatus,
  Role,
  VerificationDecision,
} from '@kamala/db';

import { PrismaService } from '../../common/prisma/prisma.service';
import {
  dayKey,
  HOUR_MS,
  median,
  MIN_CONFIDENT_SAMPLE,
  percentile,
  rate,
} from './metrics';

/** The review promise the whole platform is sold on. */
const SLA_HOURS = 24;

/** How long an enquiry may sit untouched before it counts as ignored. */
const UNANSWERED_HOURS = 48;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything the operations dashboard shows, in one call.
   *
   * One endpoint rather than several because every figure is read together and
   * they must describe the same instant — a page that fetched the funnel and
   * the sales figures separately could show a sale the funnel had not counted.
   */
  async metrics(days: number) {
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * HOUR_MS);

    const [verification, funnel, leads, sales, growth, inventory, onboarding, moderation] =
      await Promise.all([
        this.verificationHealth(since),
        this.funnel(since),
        this.leadHealth(since, now),
        this.sales(since),
        this.growth(since, days),
        this.inventory(),
        this.onboarding(),
        this.prisma.listingReport.count({ where: { status: ReportStatus.OPEN } }),
      ]);

    return {
      generatedAt: now,
      windowDays: days,
      slaHours: SLA_HOURS,
      /** Below this, medians are shown but marked as drawn from too little. */
      minConfidentSample: MIN_CONFIDENT_SAMPLE,
      verification,
      funnel,
      leads,
      sales,
      growth,
      inventory,
      onboarding,
      moderation: { openReports: moderation },
    };
  }

  /**
   * Whether the 24-hour promise is being kept.
   *
   * The single most important block on the page: it is the commitment the
   * platform makes publicly, and the only one an ops team can breach quietly.
   */
  private async verificationHealth(since: Date) {
    const overdueBefore = new Date(Date.now() - SLA_HOURS * HOUR_MS);

    const [pendingListings, pendingProjects, overdueListings, overdueProjects, decisions] =
      await Promise.all([
        this.prisma.listing.count({ where: { status: ListingStatus.PENDING_REVIEW } }),
        this.prisma.project.count({ where: { status: ProjectStatus.PENDING_REVIEW } }),
        this.prisma.listing.count({
          where: {
            status: ListingStatus.PENDING_REVIEW,
            submittedAt: { lt: overdueBefore },
          },
        }),
        this.prisma.project.count({
          where: {
            status: ProjectStatus.PENDING_REVIEW,
            submittedAt: { lt: overdueBefore },
          },
        }),
        /*
         * Verification is polymorphic over listings and projects, so the
         * submission time comes from whichever side the row points at. Both are
         * pulled in one query rather than two passes.
         */
        this.prisma.verification.findMany({
          where: { createdAt: { gte: since } },
          select: {
            decision: true,
            createdAt: true,
            listing: { select: { submittedAt: true } },
            project: { select: { submittedAt: true } },
          },
        }),
      ]);

    const waits: number[] = [];
    let approved = 0;
    let rejected = 0;
    let revisionRequested = 0;

    for (const decision of decisions) {
      if (decision.decision === VerificationDecision.APPROVED) approved += 1;
      else if (decision.decision === VerificationDecision.REJECTED) rejected += 1;
      else revisionRequested += 1;

      const submittedAt = decision.listing?.submittedAt ?? decision.project?.submittedAt;
      if (!submittedAt) continue;

      const hours = (decision.createdAt.getTime() - submittedAt.getTime()) / HOUR_MS;
      // A negative wait means the row was seeded or backdated rather than
      // decided; including it would drag the median below reality.
      if (hours >= 0) {
        waits.push(hours);
      }
    }

    const withinSla = waits.filter((hours) => hours <= SLA_HOURS).length;

    return {
      pendingListings,
      pendingProjects,
      overdue: overdueListings + overdueProjects,
      decided: {
        total: decisions.length,
        approved,
        rejected,
        revisionRequested,
      },
      medianHoursToDecision: median(waits),
      p90HoursToDecision: percentile(waits, 90),
      withinSlaPercent: rate(withinSla, waits.length),
      /** How many decisions the timings above are drawn from. */
      timedSample: waits.length,
    };
  }

  /**
   * View → shortlist → enquiry → visit → sale.
   *
   * Counted over the window rather than all time, because the useful question
   * is whether the funnel is working now, not whether it ever worked.
   */
  private async funnel(since: Date) {
    const [views, shortlists, enquiries, siteVisits, sold] = await Promise.all([
      this.prisma.listingView.count({ where: { viewedAt: { gte: since } } }),
      this.prisma.savedListing.count({ where: { createdAt: { gte: since } } }),
      this.prisma.lead.count({ where: { createdAt: { gte: since } } }),
      this.prisma.siteVisitRequest.count({ where: { createdAt: { gte: since } } }),
      this.prisma.listing.count({ where: { soldAt: { gte: since } } }),
    ]);

    return {
      views,
      shortlists,
      enquiries,
      siteVisits,
      sold,
      shortlistRate: rate(shortlists, views),
      enquiryRate: rate(enquiries, shortlists),
      visitRate: rate(siteVisits, enquiries),
    };
  }

  /**
   * What happens to an enquiry once it lands.
   *
   * `converted` is seller-reported and will under-count — a seller who closes a
   * sale rarely comes back to update a status. It is reported because the trend
   * is still informative, but `sales.throughPlatform` is the figure to trust.
   */
  private async leadHealth(since: Date, now: Date) {
    const [byStatus, answered, unanswered] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: true,
      }),
      this.prisma.lead.findMany({
        where: { createdAt: { gte: since }, contactedAt: { not: null } },
        select: { createdAt: true, contactedAt: true },
      }),
      this.prisma.lead.count({
        where: {
          status: LeadStatus.NEW,
          createdAt: { lt: new Date(now.getTime() - UNANSWERED_HOURS * HOUR_MS) },
        },
      }),
    ]);

    const counts = Object.fromEntries(
      byStatus.map((row) => [row.status, row._count]),
    ) as Partial<Record<LeadStatus, number>>;

    const total = byStatus.reduce((sum, row) => sum + row._count, 0);
    const converted = counts[LeadStatus.CONVERTED] ?? 0;

    const responseHours = answered.map(
      (lead) => (lead.contactedAt!.getTime() - lead.createdAt.getTime()) / HOUR_MS,
    );

    return {
      total,
      new: counts[LeadStatus.NEW] ?? 0,
      contacted: counts[LeadStatus.CONTACTED] ?? 0,
      interested: counts[LeadStatus.INTERESTED] ?? 0,
      notInterested: counts[LeadStatus.NOT_INTERESTED] ?? 0,
      converted,
      /** Seller-reported. See the note above before quoting this anywhere. */
      conversionPercent: rate(converted, total),
      medianResponseHours: median(responseHours),
      respondedSample: responseHours.length,
      /** Enquiries nobody has touched in two days. Actionable, not decorative. */
      unansweredOver48h: unanswered,
      unansweredHours: UNANSWERED_HOURS,
    };
  }

  /**
   * Sales, and whether this platform caused them.
   *
   * `soldThroughPlatform` is the honest measure of whether the business works:
   * the seller answers it at the moment of sale, about one transaction, in a
   * form they are already completing.
   */
  private async sales(since: Date) {
    const sold = await this.prisma.listing.findMany({
      where: { soldAt: { gte: since } },
      select: { price: true, soldPrice: true, soldThroughPlatform: true },
    });

    const throughPlatform = sold.filter((row) => row.soldThroughPlatform === true).length;
    const notThroughPlatform = sold.filter((row) => row.soldThroughPlatform === false).length;
    const attributed = throughPlatform + notThroughPlatform;

    // How far the agreed price landed from the asking price. Negative means it
    // sold under asking, which is the usual direction.
    const gaps = sold
      .filter((row) => row.soldPrice !== null)
      .map((row) => {
        const asking = Number(row.price);
        const actual = Number(row.soldPrice);
        return asking > 0 ? ((actual - asking) / asking) * 100 : null;
      })
      .filter((value): value is number => value !== null);

    return {
      sold: sold.length,
      throughPlatform,
      notThroughPlatform,
      notAnswered: sold.length - attributed,
      /** Of those who answered — not of all sales, which would understate it. */
      attributedPercent: rate(throughPlatform, attributed),
      medianPriceGapPercent: median(gaps),
      priceDisclosed: gaps.length,
    };
  }

  private async growth(since: Date, days: number) {
    const [users, registrations, listingsSubmitted, enquiries] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['role'],
        where: { createdAt: { gte: since } },
        _count: true,
      }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.listing.findMany({
        where: { submittedAt: { gte: since } },
        select: { submittedAt: true },
      }),
      this.prisma.lead.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    const byRole = Object.fromEntries(users.map((row) => [row.role, row._count])) as Partial<
      Record<Role, number>
    >;

    const bucket = (dates: Date[]): Map<string, number> => {
      const map = new Map<string, number>();
      for (const date of dates) {
        const key = dayKey(date);
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      return map;
    };

    const registrationsByDay = bucket(registrations.map((row) => row.createdAt));
    const submissionsByDay = bucket(
      listingsSubmitted.map((row) => row.submittedAt!).filter(Boolean),
    );
    const enquiriesByDay = bucket(enquiries.map((row) => row.createdAt));

    /*
     * Every day in the window, including the empty ones. A chart drawn only
     * from days that had activity compresses the quiet stretches and makes a
     * flat fortnight look busy.
     */
    const daily: Array<{
      date: string;
      registrations: number;
      listingsSubmitted: number;
      enquiries: number;
    }> = [];

    for (let offset = 0; offset < days; offset += 1) {
      const day = new Date(since);
      day.setUTCDate(day.getUTCDate() + offset);
      const key = dayKey(day);
      daily.push({
        date: key,
        registrations: registrationsByDay.get(key) ?? 0,
        listingsSubmitted: submissionsByDay.get(key) ?? 0,
        enquiries: enquiriesByDay.get(key) ?? 0,
      });
    }

    return {
      registrations: {
        total: registrations.length,
        buyers: byRole[Role.BUYER] ?? 0,
        owners: byRole[Role.OWNER] ?? 0,
        brokers: byRole[Role.BROKER] ?? 0,
        builders: byRole[Role.BUILDER] ?? 0,
      },
      daily,
    };
  }

  /** A snapshot, not a window — "how much is live right now". */
  private async inventory() {
    const [listings, projects, suspendedUsers] = await Promise.all([
      this.prisma.listing.groupBy({ by: ['status'], _count: true }),
      this.prisma.project.groupBy({ by: ['status'], _count: true }),
      this.prisma.user.count({ where: { isActive: false } }),
    ]);

    const listingCounts = Object.fromEntries(
      listings.map((row) => [row.status, row._count]),
    ) as Partial<Record<ListingStatus, number>>;
    const projectCounts = Object.fromEntries(
      projects.map((row) => [row.status, row._count]),
    ) as Partial<Record<ProjectStatus, number>>;

    return {
      liveListings: listingCounts[ListingStatus.APPROVED] ?? 0,
      draftListings: listingCounts[ListingStatus.DRAFT] ?? 0,
      pausedListings: listingCounts[ListingStatus.PAUSED] ?? 0,
      soldListings: listingCounts[ListingStatus.SOLD] ?? 0,
      rejectedListings: listingCounts[ListingStatus.REJECTED] ?? 0,
      liveProjects: projectCounts[ProjectStatus.APPROVED] ?? 0,
      draftProjects: projectCounts[ProjectStatus.DRAFT] ?? 0,
      suspendedUsers,
    };
  }

  /**
   * How far buyers get through the preference questions.
   *
   * Worth watching because every step is skippable by design — if almost
   * nobody finishes, the steps are too long rather than the buyers too lazy.
   */
  private async onboarding() {
    const [buyers, started, completed] = await Promise.all([
      this.prisma.user.count({ where: { role: Role.BUYER } }),
      this.prisma.buyerProfile.count(),
      this.prisma.buyerProfile.count({ where: { completedAt: { not: null } } }),
    ]);

    return {
      buyers,
      started,
      completed,
      completionPercent: rate(completed, started),
    };
  }
}
