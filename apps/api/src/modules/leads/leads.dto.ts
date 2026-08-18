import { LeadStatus, ReportReason } from '@kamala/db';
import { z } from 'zod';

/**
 * Contact-owner form.
 *
 * Deliberately minimal and unauthenticated. The PRD requires low-friction lead
 * capture with no signup, and forcing registration before a buyer can ask a
 * question is one of the things that pushes people back to WhatsApp and brokers.
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
