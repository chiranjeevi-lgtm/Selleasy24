import { CommitmentStatus, CommitmentType } from '@kamala/db';
import { z } from 'zod';

/**
 * Written-commitment DTOs.
 *
 * The create endpoint is deliberately awkward: it demands the signed PDF's
 * bytes (base64) so the row insertion happens *after* the document has been
 * generated and hashed. There is no "commitment without a signed PDF" path,
 * which is the whole point — a verbal promise doesn't survive to writing,
 * doesn't survive to this table.
 */

export const createCommitmentSchema = z.object({
  promiseeId: z.string().uuid('promiseeId must be a valid user id'),
  type: z.nativeEnum(CommitmentType),

  /** The exact prose that appears on the signed PDF — no rewriting server-side. */
  promiseText: z.string().trim().min(20, 'A commitment must state the promise in full').max(4000),

  /** Rupees when the commitment carries a monetary value, otherwise omit. */
  amountRupees: z.number().finite().min(0).max(1_000_000_000).optional(),

  /** Optional linkage to the surface this commitment belongs to. */
  listingId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),

  /** Optional expiry — a price hold typically expires in days, not months. */
  expiresAt: z.coerce.date().optional(),

  /**
   * The signed PDF, base64. Storage layer decodes, uploads to the private
   * documents bucket, and returns the object key + sha256 hash.
   */
  documentBase64: z
    .string()
    .min(100, 'documentBase64 looks too small to be a real PDF')
    .max(10 * 1024 * 1024, 'documentBase64 exceeds the 10MB limit'),
  documentFilename: z.string().trim().min(1).max(200),
});
export type CreateCommitmentDto = z.infer<typeof createCommitmentSchema>;

export const resolveCommitmentSchema = z.object({
  status: z.enum([
    CommitmentStatus.HONORED,
    CommitmentStatus.DISPUTED,
    CommitmentStatus.EXPIRED,
  ]),
  resolutionNote: z.string().trim().max(2000).optional(),
});
export type ResolveCommitmentDto = z.infer<typeof resolveCommitmentSchema>;

export const listCommitmentsQuerySchema = z.object({
  /**
   * Filter by any single party or surface. Admin listing uses none of these
   * to see everything; owner or lead views scope by listingId / leadId.
   */
  promisorId: z.string().uuid().optional(),
  promiseeId: z.string().uuid().optional(),
  listingId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  status: z.nativeEnum(CommitmentStatus).optional(),
  type: z.nativeEnum(CommitmentType).optional(),

  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type ListCommitmentsQueryDto = z.infer<typeof listCommitmentsQuerySchema>;
