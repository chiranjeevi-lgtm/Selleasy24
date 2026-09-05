import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LocalityReviewStatus, Prisma } from '@kamala/db';

import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  CreateLocalityReviewDto,
  ModerateLocalityReviewDto,
  ReviewListQueryDto,
  UpdateLocalityReviewDto,
} from './reviews.dto';

/**
 * How much a review can be tweaked without going back to the moderator.
 * A rating change of 2+ or 30%+ replaced text is a substantive edit and
 * requires re-moderation; smaller changes (typo fixes, adding one sentence)
 * stay approved. The threshold is intentionally forgiving — false positives
 * add queue burden, false negatives just let benign edits through.
 */
const SUBSTANTIVE_TEXT_DIFF_RATIO = 0.3;
const SUBSTANTIVE_RATING_JUMP = 2;

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Author actions
  // -------------------------------------------------------------------------

  async create(
    authorId: string,
    neighborhoodId: string,
    dto: CreateLocalityReviewDto,
  ) {
    // Look up the locality first so a bad id surfaces as 404 rather than as
    // a foreign key violation swallowed by Prisma's opaque error text.
    const locality = await this.prisma.neighborhood.findUnique({
      where: { id: neighborhoodId },
      select: { id: true },
    });
    if (!locality) {
      throw new NotFoundException('Locality not found');
    }

    try {
      const review = await this.prisma.localityReview.create({
        data: {
          neighborhoodId,
          authorId,
          rating: dto.rating,
          pros: dto.pros,
          cons: dto.cons,
          tenureYears: dto.tenureYears ?? null,
        },
      });
      return this.toPublicView(review);
    } catch (error) {
      // The unique(authorId, neighborhoodId) constraint fires here if the
      // user has already reviewed this locality. Convert P2002 into a clear
      // 409 with a message the frontend can render as "you already reviewed
      // this — would you like to edit?"
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'You already reviewed this locality. Edit your existing review instead.',
        );
      }
      throw error;
    }
  }

  async update(
    authorId: string,
    reviewId: string,
    dto: UpdateLocalityReviewDto,
  ) {
    const existing = await this.prisma.localityReview.findUnique({
      where: { id: reviewId },
    });
    if (!existing) {
      throw new NotFoundException('Review not found');
    }
    if (existing.authorId !== authorId) {
      throw new BadRequestException('You can only edit your own review');
    }

    const nextRating = dto.rating ?? existing.rating;
    const nextPros = dto.pros ?? existing.pros;
    const nextCons = dto.cons ?? existing.cons;

    // Only re-moderate on substantive changes. See the constant at the top
    // for the definition; the check is applied per field.
    const ratingJumped =
      Math.abs(nextRating - existing.rating) >= SUBSTANTIVE_RATING_JUMP;
    const prosRewritten =
      diffRatio(existing.pros, nextPros) >= SUBSTANTIVE_TEXT_DIFF_RATIO;
    const consRewritten =
      diffRatio(existing.cons, nextCons) >= SUBSTANTIVE_TEXT_DIFF_RATIO;
    const substantive = ratingJumped || prosRewritten || consRewritten;

    const shouldReset = substantive && existing.status !== LocalityReviewStatus.PENDING;

    const updated = await this.prisma.localityReview.update({
      where: { id: reviewId },
      data: {
        rating: nextRating,
        pros: nextPros,
        cons: nextCons,
        tenureYears: dto.tenureYears ?? existing.tenureYears,
        ...(shouldReset
          ? {
              status: LocalityReviewStatus.PENDING,
              moderatedById: null,
              moderatedAt: null,
              moderationNote: null,
            }
          : {}),
      },
    });

    return this.toPublicView(updated);
  }

  async deleteOwn(authorId: string, reviewId: string) {
    const existing = await this.prisma.localityReview.findUnique({
      where: { id: reviewId },
      select: { authorId: true },
    });
    if (!existing) {
      throw new NotFoundException('Review not found');
    }
    if (existing.authorId !== authorId) {
      throw new BadRequestException('You can only delete your own review');
    }
    await this.prisma.localityReview.delete({ where: { id: reviewId } });
  }

  // -------------------------------------------------------------------------
  // Public reads
  // -------------------------------------------------------------------------

  /**
   * Public list — always APPROVED only, regardless of what the client passes
   * for `status`. The moderation queue is a separate endpoint with its own
   * role gate.
   */
  async listPublic(neighborhoodId: string, query: ReviewListQueryDto) {
    const [items, total, summary] = await Promise.all([
      this.prisma.localityReview.findMany({
        where: {
          neighborhoodId,
          status: LocalityReviewStatus.APPROVED,
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          rating: true,
          pros: true,
          cons: true,
          tenureYears: true,
          createdAt: true,
          author: { select: { fullName: true } },
        },
      }),
      this.prisma.localityReview.count({
        where: {
          neighborhoodId,
          status: LocalityReviewStatus.APPROVED,
        },
      }),
      this.summarise(neighborhoodId),
    ]);

    return {
      total,
      limit: query.limit,
      offset: query.offset,
      summary,
      items: items.map((item) => ({
        id: item.id,
        rating: item.rating,
        pros: item.pros,
        cons: item.cons,
        tenureYears: item.tenureYears,
        createdAt: item.createdAt.toISOString(),
        /** First name only — protects the author from being search-indexed. */
        authorFirstName: firstNameOnly(item.author.fullName),
      })),
    };
  }

  /**
   * Locality rating summary — average + distribution.
   *
   * Deliberately called from within listPublic so the summary and the list
   * come back in one round-trip; there is no scenario where a caller wants
   * the summary without the list.
   */
  private async summarise(neighborhoodId: string) {
    const [aggregate, buckets] = await Promise.all([
      this.prisma.localityReview.aggregate({
        where: {
          neighborhoodId,
          status: LocalityReviewStatus.APPROVED,
        },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.localityReview.groupBy({
        by: ['rating'],
        where: {
          neighborhoodId,
          status: LocalityReviewStatus.APPROVED,
        },
        _count: { _all: true },
      }),
    ]);

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const bucket of buckets) {
      const rating = bucket.rating as 1 | 2 | 3 | 4 | 5;
      distribution[rating] = bucket._count._all;
    }

    return {
      averageRating:
        aggregate._avg.rating === null
          ? null
          : Math.round(aggregate._avg.rating * 10) / 10,
      totalCount: aggregate._count._all,
      distribution,
    };
  }

  async myReview(authorId: string, neighborhoodId: string) {
    const review = await this.prisma.localityReview.findUnique({
      where: {
        authorId_neighborhoodId: { authorId, neighborhoodId },
      },
    });
    if (!review) return null;
    return {
      ...this.toPublicView(review),
      status: review.status,
      moderationNote: review.moderationNote,
    };
  }

  // -------------------------------------------------------------------------
  // Moderation
  // -------------------------------------------------------------------------

  async moderationQueue(query: ReviewListQueryDto) {
    const status = query.status ?? LocalityReviewStatus.PENDING;
    const [items, total] = await Promise.all([
      this.prisma.localityReview.findMany({
        where: { status },
        orderBy: { createdAt: 'asc' },
        take: query.limit,
        skip: query.offset,
        include: {
          neighborhood: { select: { id: true, name: true, city: true } },
          author: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.localityReview.count({ where: { status } }),
    ]);

    return {
      total,
      limit: query.limit,
      offset: query.offset,
      items: items.map((item) => ({
        id: item.id,
        rating: item.rating,
        pros: item.pros,
        cons: item.cons,
        tenureYears: item.tenureYears,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        neighborhood: item.neighborhood,
        author: {
          id: item.author.id,
          fullName: item.author.fullName,
          email: item.author.email,
        },
      })),
    };
  }

  async moderate(
    moderatorId: string,
    reviewId: string,
    dto: ModerateLocalityReviewDto,
  ) {
    const existing = await this.prisma.localityReview.findUnique({
      where: { id: reviewId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Review not found');
    }
    // Idempotence — moderating an already-decided review is not an error
    // but also not something we log twice.
    const nextStatus =
      dto.decision === 'APPROVE'
        ? LocalityReviewStatus.APPROVED
        : LocalityReviewStatus.REJECTED;
    if (existing.status === nextStatus) {
      return { id: reviewId, status: nextStatus };
    }

    await this.prisma.localityReview.update({
      where: { id: reviewId },
      data: {
        status: nextStatus,
        moderatedById: moderatorId,
        moderatedAt: new Date(),
        moderationNote: dto.note ?? null,
      },
    });

    this.logger.log(
      `Locality review ${reviewId} ${nextStatus.toLowerCase()} by ${moderatorId}`,
    );

    return { id: reviewId, status: nextStatus };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private toPublicView(review: {
    id: string;
    rating: number;
    pros: string;
    cons: string;
    tenureYears: number | null;
    createdAt: Date;
  }) {
    return {
      id: review.id,
      rating: review.rating,
      pros: review.pros,
      cons: review.cons,
      tenureYears: review.tenureYears,
      createdAt: review.createdAt.toISOString(),
    };
  }
}

/** First name for public display. Everything after the first space is dropped. */
function firstNameOnly(fullName: string): string {
  const trimmed = fullName.trim();
  const space = trimmed.indexOf(' ');
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

/**
 * Rough measure of "how much did this text change". 0 = identical,
 * 1 = completely different. Not a proper diff — just a character-length
 * ratio that catches wholesale rewrites without flagging typo fixes.
 */
function diffRatio(before: string, after: string): number {
  if (before === after) return 0;
  const maxLen = Math.max(before.length, after.length);
  if (maxLen === 0) return 0;
  // A minimal character-based distance: prefix overlap + suffix overlap.
  let prefix = 0;
  const minLen = Math.min(before.length, after.length);
  while (prefix < minLen && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  const changed = maxLen - prefix - suffix;
  return Math.max(0, Math.min(1, changed / maxLen));
}
