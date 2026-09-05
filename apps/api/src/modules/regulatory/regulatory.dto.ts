import { RegulatoryAuthority, RegulatoryStatus } from '@kamala/db';
import { z } from 'zod';

/**
 * Upserting a regulatory registration.
 *
 * The registrationNumber is the natural key — a single record per external
 * registration, keyed by what the authority itself issued. Upsert semantics
 * come from the unique constraint on that column: creating twice with the
 * same number updates the existing row rather than duplicating.
 */
export const upsertRegistrationSchema = z.object({
  authority: z.nativeEnum(RegulatoryAuthority).default(RegulatoryAuthority.TSRERA),
  registrationNumber: z
    .string()
    .trim()
    .min(6, 'Registration number looks too short')
    .max(64, 'Registration number looks too long')
    /*
     * TSRERA numbers are alphanumeric plus `/`, no spaces. Deliberately
     * permissive here so records from HMDA and GHMC (different formats)
     * validate too — the authority owns the format, and we just store it.
     */
    .regex(/^[A-Za-z0-9\/\-_]+$/, 'Use only letters, numbers and / - _'),
  projectName: z.string().trim().min(2, 'Project name is required').max(255),
  promoterName: z.string().trim().min(2, 'Promoter name is required').max(255),
  towerPhases: z.string().trim().max(500).optional(),
  totalUnits: z.coerce.number().int().min(1).max(50_000).optional(),
  registeredOn: z.coerce.date(),
  expiresOn: z.coerce.date().optional(),
  status: z.nativeEnum(RegulatoryStatus).default(RegulatoryStatus.ACTIVE),
  approvalNotes: z.string().trim().max(1000).optional(),
});

export type UpsertRegistrationDto = z.infer<typeof upsertRegistrationSchema>;

export const registrationListQuerySchema = z.object({
  authority: z.nativeEnum(RegulatoryAuthority).optional(),
  status: z.nativeEnum(RegulatoryStatus).optional(),
  /** Substring match on projectName or promoterName. */
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export type RegistrationListQueryDto = z.infer<typeof registrationListQuerySchema>;
