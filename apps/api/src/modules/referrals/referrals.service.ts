import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ReferralStatus,
  RewardRecipientKind,
  RewardStatus,
  Role,
} from '@kamala/db';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { RedeemReferralDto } from './referrals.dto';

/**
 * Deliberately excludes 0/O and 1/I/L — codes are read aloud and typed
 * by hand, and those pairs are a support-ticket generator.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/**
 * Reward amounts. Hardcoded rather than env-configured for now because a
 * PAID historical reward's amount must remain what it was at qualification
 * — moving these to env would tempt someone to "just bump both" and
 * invalidate the ledger. When the program economics need to change, the
 * right move is to introduce a program-version column and read from that.
 */
const REFERRER_REWARD_RUPEES = 500;
const REFERRED_REWARD_RUPEES = 300;

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get-or-create the referral code for the current user. Idempotent —
   * calling it twice returns the same code. The "get" side matters:
   * users share codes across devices and re-fetching should never produce
   * a new one that invalidates the message they already sent.
   */
  async getOrCreateCode(userId: string) {
    const existing = await this.prisma.referralCode.findUnique({
      where: { userId },
      select: { id: true, code: true, createdAt: true },
    });
    if (existing) return existing;

    // Retry up to 5 times on the rare collision (unique constraint on
    // code). With ~30^8 possibilities the odds are negligible but the
    // retry is cheap.
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = this.generateCode();
      try {
        const created = await this.prisma.referralCode.create({
          data: { userId, code: candidate },
          select: { id: true, code: true, createdAt: true },
        });
        return created;
      } catch (error) {
        // Only retry on unique-constraint violation; any other error
        // (userId FK failure, DB down) surfaces immediately.
        if (
          error instanceof Error &&
          'code' in error &&
          (error as { code?: string }).code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('Could not generate a unique referral code after retries');
  }

  /**
   * List referrals the current user has MADE — one row per person they
   * successfully referred. Includes the referred user's first name +
   * signup date, deliberately excluding email/phone.
   *
   * Also returns the caller's reward totals — pending vs paid — so the
   * /refer page can show "₹1,200 earned, ₹500 pending" without a second
   * round trip.
   */
  async listMyReferrals(userId: string) {
    const [rows, rewards] = await Promise.all([
      this.prisma.referral.findMany({
        where: { referrerId: userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          code: true,
          status: true,
          createdAt: true,
          qualifiedAt: true,
          paidAt: true,
          referred: { select: { fullName: true } },
        },
      }),
      // Includes rewards earned as REFERRER *and* as REFERRED (a user can
      // be both — earned once by being referred, earned N times by referring
      // others). Grouping by status covers all cases in one query.
      this.prisma.referralReward.groupBy({
        by: ['status'],
        where: { recipientUserId: userId },
        _sum: { amountRupees: true },
      }),
    ]);

    const totalByStatus = (status: RewardStatus): number => {
      const row = rewards.find((r) => r.status === status);
      const sum = row?._sum.amountRupees;
      return sum ? Number(sum) : 0;
    };

    return {
      items: rows.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        qualifiedAt: r.qualifiedAt?.toISOString() ?? null,
        paidAt: r.paidAt?.toISOString() ?? null,
        // First name only — the referrer knows who they invited; we don't
        // need to leak the full display name to the referrals dashboard.
        referredFirstName:
          r.referred.fullName.trim().split(/\s+/)[0] ?? 'A friend',
      })),
      counts: {
        total: rows.length,
        pending: rows.filter((r) => r.status === ReferralStatus.PENDING).length,
        qualified: rows.filter((r) => r.status === ReferralStatus.QUALIFIED).length,
        paid: rows.filter((r) => r.status === ReferralStatus.PAID).length,
      },
      rewards: {
        pendingRupees: totalByStatus(RewardStatus.PENDING),
        paidRupees: totalByStatus(RewardStatus.PAID),
      },
    };
  }

  /**
   * Redeem a referral code as the current user — creates a Referral row
   * linking the code owner (referrer) and this user (referred).
   *
   * Guards:
   *  - Code must exist
   *  - Referrer must not be the same as the redeemer (self-referral)
   *  - Redeemer must not have already redeemed a code (unique on referredId)
   */
  async redeem(
    userId: string,
    dto: RedeemReferralDto,
    ctx?: { ip?: string; userAgent?: string },
  ) {
    const codeOwner = await this.prisma.referralCode.findUnique({
      where: { code: dto.code },
      select: { userId: true },
    });
    if (!codeOwner) {
      throw new NotFoundException('That referral code does not exist');
    }
    if (codeOwner.userId === userId) {
      throw new BadRequestException('You cannot redeem your own referral code');
    }

    const alreadyReferred = await this.prisma.referral.findUnique({
      where: { referredId: userId },
      select: { id: true },
    });
    if (alreadyReferred) {
      throw new ConflictException(
        'You have already redeemed a referral code — one per account',
      );
    }

    const created = await this.prisma.referral.create({
      data: {
        referrerId: codeOwner.userId,
        referredId: userId,
        code: dto.code,
        status: ReferralStatus.PENDING,
        signupIp: ctx?.ip ?? null,
        signupUserAgent: ctx?.userAgent ?? null,
      },
      select: { id: true, code: true, status: true, createdAt: true },
    });
    return {
      id: created.id,
      code: created.code,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * Register-flow variant of redeem — swallows all failures and logs.
   *
   * Signup must never fail because a referral code was invalid, expired,
   * or belongs to a suspended user; from the new user's point of view they
   * typed a code once and the account creation should succeed regardless.
   * Returns whether the redemption landed so callers can decide whether
   * to surface a "referral applied" hint.
   */
  async redeemSafely(
    userId: string,
    code: string,
    ctx?: { ip?: string; userAgent?: string },
  ): Promise<{ applied: boolean }> {
    try {
      await this.redeem(userId, { code: code.trim().toUpperCase() }, ctx);
      return { applied: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Referral code redemption skipped for ${userId}: ${message}`);
      return { applied: false };
    }
  }

  /**
   * Seller-side qualification: called when a listing is first approved.
   * Idempotent — safe to call twice for the same listing without issuing
   * duplicate rewards, because the reward rows are keyed by (referral,
   * recipientKind) and creation runs inside a transaction with the
   * PENDING → QUALIFIED status flip.
   *
   * A referral qualifies on the seller's FIRST approved listing. Subsequent
   * approvals are no-ops because the referral is already QUALIFIED/PAID.
   */
  async qualifyForSeller(userId: string): Promise<void> {
    const referral = await this.prisma.referral.findUnique({
      where: { referredId: userId },
      select: { id: true, status: true },
    });
    // No referral tied to this user, or already past PENDING — nothing to do.
    if (!referral || referral.status !== ReferralStatus.PENDING) return;

    await this.qualify(referral.id);
  }

  /**
   * Buyer-side qualification: called when a signed-in buyer submits their
   * first lead. Same idempotency guarantees as the seller path.
   *
   * The schema comment mentions "first enquiry + visit completed" as the
   * intended qualifying condition, but the site-visit COMPLETED transition
   * isn't a user-visible action yet in the codebase — no endpoint sets it.
   * First-lead is a reasonable proxy that also creates a real intent
   * signal (buyer's contact info is now visible to a seller). When visit
   * completion becomes tracked, tighten this to require it.
   */
  async qualifyForBuyer(userId: string): Promise<void> {
    const referral = await this.prisma.referral.findUnique({
      where: { referredId: userId },
      select: { id: true, status: true },
    });
    if (!referral || referral.status !== ReferralStatus.PENDING) return;

    await this.qualify(referral.id);
  }

  /**
   * Common qualify path — writes the status flip and both reward rows in
   * one transaction. The unique (referralId, recipientKind) constraint
   * makes duplicate calls safe: a second call throws P2002 on reward
   * insert, which we detect and treat as "already qualified".
   */
  private async qualify(referralId: string): Promise<void> {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
      select: { id: true, referrerId: true, referredId: true, status: true },
    });
    if (!referral || referral.status !== ReferralStatus.PENDING) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.referral.update({
          where: { id: referralId },
          data: {
            status: ReferralStatus.QUALIFIED,
            qualifiedAt: new Date(),
          },
        });

        await tx.referralReward.create({
          data: {
            referralId,
            recipientUserId: referral.referrerId,
            recipientKind: RewardRecipientKind.REFERRER,
            amountRupees: new Prisma.Decimal(REFERRER_REWARD_RUPEES),
            status: RewardStatus.PENDING,
          },
        });

        await tx.referralReward.create({
          data: {
            referralId,
            recipientUserId: referral.referredId,
            recipientKind: RewardRecipientKind.REFERRED,
            amountRupees: new Prisma.Decimal(REFERRED_REWARD_RUPEES),
            status: RewardStatus.PENDING,
          },
        });
      });
    } catch (error) {
      // P2002 on referral_rewards unique constraint means another concurrent
      // call already qualified this referral. Idempotent by design — swallow.
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        this.logger.debug(`Referral ${referralId} already qualified (concurrent call)`);
        return;
      }
      throw error;
    }
  }

  /**
   * Admin listing of rewards, for the payout queue.
   *
   * Filters kept small: status (default PENDING) and referrer/recipient
   * lookups by user id when investigating a specific case. Pagination
   * default is 50 — payout batches are reviewed in chunks.
   */
  async listRewards(
    actor: { role: Role },
    params: {
      status?: RewardStatus;
      recipientUserId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    if (
      actor.role !== Role.ADMIN &&
      actor.role !== Role.SUPER_ADMIN &&
      actor.role !== Role.MODERATOR
    ) {
      throw new ForbiddenException('Only staff may list rewards.');
    }

    const where: Prisma.ReferralRewardWhereInput = {
      status: params.status ?? RewardStatus.PENDING,
      ...(params.recipientUserId && { recipientUserId: params.recipientUserId }),
    };

    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    const [total, items] = await Promise.all([
      this.prisma.referralReward.count({ where }),
      this.prisma.referralReward.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          referralId: true,
          recipientKind: true,
          amountRupees: true,
          status: true,
          paidAt: true,
          paymentNote: true,
          createdAt: true,
          recipient: { select: { id: true, fullName: true, email: true } },
          referral: {
            select: {
              id: true,
              code: true,
              signupIp: true,
              qualifiedAt: true,
              referrer: { select: { id: true, fullName: true, email: true } },
              referred: { select: { id: true, fullName: true, email: true } },
            },
          },
        },
      }),
    ]);

    return { total, limit, offset, items };
  }

  /**
   * Admin action — mark a reward paid (bank transfer done, credit applied)
   * or voided (fraud, chargeback). If both reward rows on a Referral end
   * up PAID, the Referral itself is promoted to PAID; if either is VOIDED,
   * the Referral goes to VOIDED. Otherwise the Referral stays QUALIFIED.
   */
  async markReward(
    rewardId: string,
    action: 'PAID' | 'VOIDED',
    paymentNote: string | undefined,
    actor: { id: string; role: Role },
  ) {
    if (
      actor.role !== Role.ADMIN &&
      actor.role !== Role.SUPER_ADMIN &&
      actor.role !== Role.MODERATOR
    ) {
      throw new ForbiddenException('Only staff may resolve rewards.');
    }

    const reward = await this.prisma.referralReward.findUnique({
      where: { id: rewardId },
      select: { id: true, referralId: true, status: true },
    });
    if (!reward) throw new NotFoundException('Reward not found.');
    if (reward.status !== RewardStatus.PENDING) {
      throw new BadRequestException(
        `Reward is already ${reward.status.toLowerCase()}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.referralReward.update({
        where: { id: rewardId },
        data: {
          status: action,
          paidAt: new Date(),
          paidById: actor.id,
          paymentNote: paymentNote ?? null,
        },
      });

      // Roll the Referral status forward when the sibling reward's state is
      // known — otherwise this Referral sits at QUALIFIED forever even
      // though both sides may have been paid.
      const siblingRewards = await tx.referralReward.findMany({
        where: { referralId: reward.referralId },
        select: { status: true },
      });
      const allPaid = siblingRewards.every((r) => r.status === RewardStatus.PAID);
      const anyVoided = siblingRewards.some((r) => r.status === RewardStatus.VOIDED);

      if (allPaid) {
        await tx.referral.update({
          where: { id: reward.referralId },
          data: { status: ReferralStatus.PAID, paidAt: new Date() },
        });
      } else if (anyVoided) {
        await tx.referral.update({
          where: { id: reward.referralId },
          data: { status: ReferralStatus.VOIDED },
        });
      }
    });

    return this.prisma.referralReward.findUniqueOrThrow({
      where: { id: rewardId },
      select: {
        id: true,
        status: true,
        paidAt: true,
        paymentNote: true,
      },
    });
  }

  private generateCode(): string {
    const bytes = randomBytes(CODE_LENGTH);
    let out = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      out += CODE_ALPHABET.charAt(bytes[i]! % CODE_ALPHABET.length);
    }
    return out;
  }
}
