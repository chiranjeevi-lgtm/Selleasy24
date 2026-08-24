import { LeadStatus, ReportReason } from '@kamala/db';
import { z } from 'zod';

/**
 * Contact-owner form.
 *
 * Now requires a signed-in buyer. The PRD originally specified low-friction,
 * unauthenticated capture, and that trade is real — a sign-in wall at the
 * moment of conversion costs enquiry volume.
 *
 * It was changed deliberately: on a platform whose entire proposition is that
 * both sides have been checked, an anonymous enquiry is a weak signal. Sellers
 * were receiving contacts nobody had verified, which is the same junk-lead
 * problem the incumbents have. Name and phone are still collected rather than
 * taken from the account, because the number a buyer wants to be reached on is
 * often not the one they registered with.
 */
export const createLeadSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9][0-9]{7,14}$/, 'Enter a valid phone number'),
  email: z.string().trim().toLowerCase().email().max(255).optional(),
  message: z.string().trim().max(1000).optional(),
  /** Free text rather than a slot picker; scheduling is Phase 2. */
  preferredTime: z.string().trim().max(120).optional(),
});

export type CreateLeadDto = z.infer<typeof createLeadSchema>;

/**
 * Enquiring about a builder project.
 *
 * The same contact fields, plus which configuration caught their eye. No
 * `preferredTime`: that field exists on a resale enquiry because the buyer is
 * arranging to meet one owner at one flat, while a project enquiry goes to a
 * sales team who will call back — asking for a preferred viewing slot before
 * anyone has spoken would be answering a question nobody asked.
 */
export const createProjectLeadSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9][0-9]{7,14}$/, 'Enter a valid phone number'),
  email: z.string().trim().toLowerCase().email().max(255).optional(),
  message: z.string().trim().max(1000).optional(),
  /** Checked against this project's own units by the service, not just for existence. */
  projectUnitId: z.string().uuid().optional(),
});

export type CreateProjectLeadDto = z.infer<typeof createProjectLeadSchema>;

export const updateLeadStatusSchema = z.object({
  status: z.nativeEnum(LeadStatus),
});

export type UpdateLeadStatusDto = z.infer<typeof updateLeadStatusSchema>;

export const createReportSchema = z.object({
  reason: z.nativeEnum(ReportReason),
  details: z.string().trim().max(1000).optional(),
});

export type CreateReportDto = z.infer<typeof createReportSchema>;

export const resolveReportSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED', 'IN_REVIEW']),
  resolutionNote: z.string().trim().min(5, 'Record what was done').max(1000),
});

export type ResolveReportDto = z.infer<typeof resolveReportSchema>;

// ---------------------------------------------------------------------------
// Site visits
// ---------------------------------------------------------------------------

/**
 * A buyer proposing a time to see the property.
 *
 * The slot is a real timestamp rather than free text, so both sides see the
 * same moment and it can be sorted, reminded on and shown in a calendar later.
 * "Saturday morning" cannot.
 */
export const createSiteVisitSchema = z.object({
  preferredAt: z.coerce
    .date()
    .refine((date) => date.getTime() > Date.now(), {
      message: 'Choose a time in the future',
    })
    .refine((date) => date.getTime() < Date.now() + 90 * 86_400_000, {
      message: 'Choose a time within the next 90 days',
    }),
  note: z.string().trim().max(500).optional(),
});

export type CreateSiteVisitDto = z.infer<typeof createSiteVisitSchema>;

/**
 * The seller's response.
 *
 * Confirming takes the buyer's slot unless a different one is supplied;
 * proposing a new time is what RESCHEDULED means, and the database rejects that
 * status without a time attached.
 */
export const respondSiteVisitSchema = z
  .object({
    decision: z.enum(['CONFIRM', 'RESCHEDULE', 'DECLINE']),
    /** Required when rescheduling; optional override when confirming. */
    proposedAt: z.coerce.date().optional(),
    sellerNote: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === 'RESCHEDULE' && !data.proposedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proposedAt'],
        message: 'Suggest a time when asking to reschedule',
      });
    }
    if (data.proposedAt && data.proposedAt.getTime() <= Date.now()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proposedAt'],
        message: 'Choose a time in the future',
      });
    }
    // Declining without a word is the behaviour buyers complain about most on
    // the incumbent portals — the request simply goes quiet.
    if (data.decision === 'DECLINE' && !data.sellerNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sellerNote'],
        message: 'Tell the buyer why, even briefly',
      });
    }
  });

export type RespondSiteVisitDto = z.infer<typeof respondSiteVisitSchema>;
