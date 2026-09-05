import { FieldAgentStatus } from '@kamala/db';
import { z } from 'zod';

/**
 * Field-agent application — submitted from /become-an-agent.
 *
 * Public endpoint: applicants have no SellEasy24 account yet. The apply
 * call creates a `User` (role = AGENT_APPLICANT) alongside the FieldAgent
 * row in one transaction and returns an authenticated session so the
 * applicant lands on their pending-status page already signed in.
 *
 * Existing accounts that want to *also* become an agent go through
 * POST /field-agents/me/apply while logged in — see applyAgentAsUserSchema
 * below. This split keeps the anonymous path honest: applicants either
 * create an account by applying, or link an existing account by applying
 * while signed in. No admin-side UUID-pasting reconciliation either way.
 */
export const applyAgentSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your full name')
    .max(120, 'Name is too long'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9][0-9]{7,14}$/, 'Enter a valid phone number in international format'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address')
    .max(255),
  /**
   * Password sets up the applicant's account so they can sign back in to
   * check status. Matches auth register's min-length rule — the same
   * password policy applies whether the account started as a buyer or
   * as an agent applicant.
   */
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long'),
  /**
   * Free-text bucket: none / 1-2 / 3-5 / 5+. Kept as a string enum rather
   * than a strict enum so future additions don't need a migration.
   */
  experience: z.enum(['none', '1-2', '3-5', '5+']),
  /**
   * At least one service locality is required — otherwise there's nowhere
   * to route assignments. Cap at 30 to prevent someone selecting "the
   * whole city" which is operationally meaningless.
   */
  serviceLocalities: z
    .array(z.string().trim().min(1).max(100))
    .min(1, 'Pick at least one locality you can service')
    .max(30, 'That is more localities than we can meaningfully match'),
  notes: z.string().trim().max(1000).optional(),
});

export type ApplyAgentDto = z.infer<typeof applyAgentSchema>;

/**
 * Field-agent application submitted by an already-authenticated user.
 *
 * No email or password — those come from the existing account. The
 * applicant's current role (BUYER / OWNER / …) is preserved through
 * PENDING review; on activation it is upgraded to FIELD_AGENT, same as
 * the anonymous path.
 */
export const applyAgentAsUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9][0-9]{7,14}$/, 'Enter a valid phone number in international format'),
  experience: z.enum(['none', '1-2', '3-5', '5+']),
  serviceLocalities: z
    .array(z.string().trim().min(1).max(100))
    .min(1, 'Pick at least one locality you can service')
    .max(30),
  notes: z.string().trim().max(1000).optional(),
});

export type ApplyAgentAsUserDto = z.infer<typeof applyAgentAsUserSchema>;

/**
 * Admin queue query — how many pending / active agents to show, in what
 * order. Defaults to oldest-first over pending, which is the FIFO
 * moderation queue.
 */
export const agentQueueQuerySchema = z.object({
  status: z.nativeEnum(FieldAgentStatus).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export type AgentQueueQueryDto = z.infer<typeof agentQueueQuerySchema>;

/**
 * Admin action — suspending an agent. Suspension requires a reason so the
 * record shows why access was revoked.
 *
 * Activation takes no body — every FieldAgent row now has a linked user
 * from the moment it is created (via apply or apply-for-me), so there is
 * no UUID reconciliation step to perform.
 */
export const suspendAgentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Give a short reason for suspension')
    .max(500),
});

export type SuspendAgentDto = z.infer<typeof suspendAgentSchema>;
