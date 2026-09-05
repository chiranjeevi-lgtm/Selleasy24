import { LocalityReviewStatus } from '@kamala/db';
import { z } from 'zod';

/**
 * A resident submitting a locality review.
 *
 * Pros and cons are separate short fields rather than one long text: the
 * locality page renders them as a scannable list, and asking for both up
 * front prevents the classic pattern of one-sided review-bombing where
 * every review is either five stars ("perfect neighbourhood!") or one star
 * ("worst place ever"). If you can't articulate at least one of each, we'd
 * rather you didn't submit.
 */
export const createLocalityReviewSchema = z.object({
  rating: z.coerce
    .number()
    .int('Rating must be a whole number')
    .min(1, 'Rating must be between 1 and 5')
    .max(5, 'Rating must be between 1 and 5'),
  pros: z
    .string()
    .trim()
    .min(15, 'Say a little more about what works')
    .max(500),
  cons: z
    .string()
    .trim()
    .min(15, 'Say a little more about what does not')
    .max(500),
  tenureYears: z.coerce
    .number()
    .int('Tenure must be a whole number of years')
    .min(0, 'Tenure cannot be negative')
    .max(80, 'Enter a realistic number of years')
    .optional(),
});

export type CreateLocalityReviewDto = z.infer<typeof createLocalityReviewSchema>;

/**
 * Editing your own review.
 *
 * Editing does NOT reset the moderation status — a review that changed by
 * two rating points and added a paragraph goes back to PENDING and is
 * re-moderated. A five-word tweak on an already-approved review stays
 * approved, so a typo fix is not a queue burden.
 *
 * That policy lives in the service, not here — the DTO stays a plain edit
 * shape.
 */
export const updateLocalityReviewSchema = createLocalityReviewSchema.partial();
export type UpdateLocalityReviewDto = z.infer<typeof updateLocalityReviewSchema>;

/**
 * A moderator resolving a review.
 *
 * Approving requires no reason; rejecting does. The requirement is
 * deliberate — silent rejections are how moderation queues become opaque,
 * and the author sees the reason on their dashboard so they know what to
 * fix.
 */
export const moderateLocalityReviewSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === 'REJECT' && (!data.note || data.note.length < 10)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'Give the author at least a short reason (10+ characters)',
      });
    }
  });

export type ModerateLocalityReviewDto = z.infer<typeof moderateLocalityReviewSchema>;

/**
 * List query — pagination for both the public list and the moderation queue.
 * `status` is optional and only respected on the moderator endpoint; on the
 * public endpoint the service always forces APPROVED regardless of what the
 * client sends.
 */
export const reviewListQuerySchema = z.object({
  status: z.nativeEnum(LocalityReviewStatus).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export type ReviewListQueryDto = z.infer<typeof reviewListQuerySchema>;
