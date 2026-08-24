import { BuyingPurpose, Occupation } from '@kamala/db';
import { z } from 'zod';

/**
 * Buyer preferences, one schema per step.
 *
 * Separate schemas rather than one partial schema, because each step is saved
 * on its own. A single `.partial()` shape would accept any subset from any
 * step, which means a malformed client could write the budget fields while
 * claiming to submit the locality step — and nothing would notice.
 */

const rupees = z
  .number()
  .int('Enter a whole number of rupees')
  .min(0)
  .max(10_000_000_000, 'That is larger than any property on the platform');

/** Step 1 — why they are buying and who for. */
export const purposeStepSchema = z.object({
  purpose: z.nativeEnum(BuyingPurpose),
  householdSize: z.number().int().min(1).max(30).optional(),
  bedroomsWanted: z.number().int().min(0).max(20).optional(),
});

export type PurposeStepDto = z.infer<typeof purposeStepSchema>;

/**
 * Step 2 — budget.
 *
 * `monthlyIncome` is optional and stays that way. It adds nothing to ranking —
 * budget already carries that — and exists only to say what a bank is likely to
 * lend. Making it required would cost sign-ups and invite invented numbers.
 */
export const budgetStepSchema = z
  .object({
    budgetMin: rupees.optional(),
    budgetMax: rupees.optional(),
    monthlyIncome: rupees.optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.budgetMin !== undefined &&
      data.budgetMax !== undefined &&
      data.budgetMin > data.budgetMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['budgetMax'],
        message: 'The maximum must be at least the minimum',
      });
    }
  });

export type BudgetStepDto = z.infer<typeof budgetStepSchema>;

/**
 * Step 3 — where.
 *
 * Capped at eight. A buyer who picks every locality has expressed no preference
 * at all, and the ranking would then be driven entirely by budget.
 */
export const localitiesStepSchema = z.object({
  neighborhoodIds: z
    .array(z.string().uuid())
    .max(8, 'Pick up to eight areas — more than that is not really a preference')
    .refine((ids) => new Set(ids).size === ids.length, 'An area can appear only once')
    .default([]),
});

export type LocalitiesStepDto = z.infer<typeof localitiesStepSchema>;

/** Step 4 — about them. Optional, and the step that marks the run complete. */
export const aboutStepSchema = z.object({
  occupation: z.nativeEnum(Occupation).optional(),
});

export type AboutStepDto = z.infer<typeof aboutStepSchema>;

/**
 * Household size to a suggested bedroom count.
 *
 * A suggestion the buyer can override, not a rule. Two people who intend to
 * start a family want a different flat from two people who do not, and no
 * function can know which is which — so this only ever pre-fills a field.
 */
export function suggestedBedrooms(householdSize: number): number {
  if (householdSize <= 1) return 1;
  if (householdSize <= 3) return 2;
  if (householdSize <= 5) return 3;
  return 4;
}
