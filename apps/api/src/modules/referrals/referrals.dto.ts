import { RewardStatus } from '@kamala/db';
import { z } from 'zod';

/**
 * Redeem a referral code — used during (or shortly after) sign-up. Codes
 * are alphanumeric uppercase 6–10 chars but we accept any case at the
 * boundary and normalise inside the service, because typing a code with
 * shift-key precision is friction a modest reward doesn't justify.
 */
export const redeemReferralSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(6, 'Referral code is too short')
    .max(16, 'Referral code is too long')
    .regex(/^[A-Z0-9]+$/, 'Referral codes are letters and numbers only'),
});

export type RedeemReferralDto = z.infer<typeof redeemReferralSchema>;

/** Admin — filter the reward-payout queue. */
export const listRewardsQuerySchema = z.object({
  status: z.nativeEnum(RewardStatus).default(RewardStatus.PENDING),
  recipientUserId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type ListRewardsQueryDto = z.infer<typeof listRewardsQuerySchema>;

/**
 * Admin — resolve a reward. paymentNote carries the UTR / credit-ref for
 * PAID, or the void reason for VOIDED. Kept optional at the schema level;
 * front-end may enforce required for VOIDED so a reason isn't dropped.
 */
export const markRewardSchema = z.object({
  action: z.enum(['PAID', 'VOIDED']),
  paymentNote: z.string().trim().max(1000).optional(),
});
export type MarkRewardDto = z.infer<typeof markRewardSchema>;
