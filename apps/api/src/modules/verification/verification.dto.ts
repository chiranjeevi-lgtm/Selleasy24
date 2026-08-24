import { ProjectStage, VerificationCheckKind, VerificationDecision } from '@kamala/db';
import { z } from 'zod';

/**
 * Checks that must be recorded AND passing before a listing can be approved.
 *
 * These are the platform's promise made concrete. A listing carries the verified
 * badge only when a human has affirmatively confirmed all four against the
 * uploaded documents.
 */
export const MANDATORY_CHECKS: readonly VerificationCheckKind[] = [
  VerificationCheckKind.OWNER_NAME_MATCHES_DEED,
  VerificationCheckKind.DEED_REGISTERED_AND_STAMPED,
  VerificationCheckKind.PROPERTY_TAX_CURRENT,
  VerificationCheckKind.LOCATION_MATCHES_DOCUMENTS,
];

/**
 * Conditional checks. Recorded when relevant, not required for every property.
 * The Encumbrance Certificate is optional in Month 1; RERA applies only to
 * under-construction projects and broker listings.
 */
export const OPTIONAL_CHECKS: readonly VerificationCheckKind[] = [
  VerificationCheckKind.NO_ENCUMBRANCE_FOUND,
  VerificationCheckKind.RERA_REGISTERED,
];

const checkResultSchema = z.object({
  kind: z.nativeEnum(VerificationCheckKind),
  passed: z.boolean(),
  /**
   * Shown publicly on the badge, so it must be safe to display — e.g.
   * "EC not required for this property type". Never internal commentary.
   */
  note: z.string().trim().max(300).optional(),
});

export const decideSchema = z
  .object({
    decision: z.nativeEnum(VerificationDecision),

    /** Sent to the seller. Mandatory unless approving. */
    reason: z.string().trim().min(10, 'Give the seller a usable reason').max(1000).optional(),

    /** Staff-only commentary. Never returned on any seller or public endpoint. */
    internalNotes: z.string().trim().max(2000).optional(),

    checks: z.array(checkResultSchema).max(10).default([]),
  })
  .superRefine((data, ctx) => {
    // A rejection or revision request without a reason is useless to the seller
    // and is exactly the "complaint vanished into a void" behaviour users
    // criticise incumbents for.
    if (data.decision !== VerificationDecision.APPROVED && !data.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A reason is required when rejecting or requesting a revision',
      });
    }

    if (data.decision === VerificationDecision.APPROVED) {
      const byKind = new Map(data.checks.map((c) => [c.kind, c]));

      for (const required of MANDATORY_CHECKS) {
        const result = byKind.get(required);
        if (!result) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['checks'],
            message: `Check ${required} must be recorded before approval`,
          });
        } else if (!result.passed) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['checks'],
            message: `Cannot approve: ${required} did not pass`,
          });
        }
      }
    }

    // Duplicate results for one check would make the public badge ambiguous.
    const seen = new Set<string>();
    for (const check of data.checks) {
      if (seen.has(check.kind)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['checks'],
          message: `Duplicate result for ${check.kind}`,
        });
      }
      seen.add(check.kind);
    }
  });

export type DecideDto = z.infer<typeof decideSchema>;

export const queueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QueueQueryDto = z.infer<typeof queueQuerySchema>;

// ---------------------------------------------------------------------------
// Builder projects
// ---------------------------------------------------------------------------

/**
 * Checks required on every project, whatever its stage.
 *
 * All three are about the builder's right to be selling this at all: registered
 * with RERA, plan sanctioned, and land title clear. A project failing any one of
 * them should not be advertised, and in Telangana advertising without the first
 * is illegal outright.
 */
export const MANDATORY_PROJECT_CHECKS: readonly VerificationCheckKind[] = [
  VerificationCheckKind.PROJECT_RERA_VALID,
  VerificationCheckKind.PROJECT_PLAN_SANCTIONED,
  VerificationCheckKind.PROJECT_LAND_TITLE_CLEAR,
];

/**
 * The full mandatory set for a given stage.
 *
 * Stage-dependent because the documents that exist depend on how far along the
 * project is, and demanding an occupancy certificate from a pre-launch project
 * would make an honest submission unapprovable. The converse matters more: a
 * project claiming to be ready to move in, without an occupancy certificate,
 * is claiming something it cannot legally deliver.
 *
 * Enforced in the service rather than in Zod — the schema sees the request body
 * and has no way to know which project it refers to.
 */
export function mandatoryChecksForStage(
  stage: ProjectStage,
): readonly VerificationCheckKind[] {
  switch (stage) {
    case ProjectStage.PRE_LAUNCH:
      return MANDATORY_PROJECT_CHECKS;
    case ProjectStage.UNDER_CONSTRUCTION:
    case ProjectStage.NEARING_POSSESSION:
      return [
        ...MANDATORY_PROJECT_CHECKS,
        VerificationCheckKind.PROJECT_COMMENCEMENT_CERTIFICATE,
      ];
    case ProjectStage.READY_TO_MOVE:
    case ProjectStage.DELIVERED:
      return [
        ...MANDATORY_PROJECT_CHECKS,
        VerificationCheckKind.PROJECT_COMMENCEMENT_CERTIFICATE,
        VerificationCheckKind.PROJECT_OCCUPANCY_CERTIFICATE,
      ];
  }
}

/**
 * Project decision.
 *
 * Same shape as the listing decision, but the approval rule cannot live here:
 * which checks are mandatory depends on the project's stage, which the body does
 * not carry. Zod enforces what it can see — a reason on anything but an
 * approval, and no duplicate results — and the service applies the stage rule.
 */
export const decideProjectSchema = z
  .object({
    decision: z.nativeEnum(VerificationDecision),
    reason: z.string().trim().min(10, 'Give the builder a usable reason').max(1000).optional(),
    internalNotes: z.string().trim().max(2000).optional(),
    checks: z.array(checkResultSchema).max(10).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.decision !== VerificationDecision.APPROVED && !data.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A reason is required when rejecting or requesting a revision',
      });
    }

    const seen = new Set<string>();
    for (const check of data.checks) {
      if (seen.has(check.kind)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['checks'],
          message: `Duplicate result for ${check.kind}`,
        });
      }
      seen.add(check.kind);
    }
  });

export type DecideProjectDto = z.infer<typeof decideProjectSchema>;

/** Human-readable labels for the public badge. */
export const CHECK_LABELS: Record<VerificationCheckKind, string> = {
  [VerificationCheckKind.OWNER_NAME_MATCHES_DEED]:
    'Owner name on identity proof matches the sale deed',
  [VerificationCheckKind.DEED_REGISTERED_AND_STAMPED]:
    'Sale deed is registered and properly stamped',
  [VerificationCheckKind.PROPERTY_TAX_CURRENT]: 'Property tax is paid and current',
  [VerificationCheckKind.LOCATION_MATCHES_DOCUMENTS]:
    'Address matches the location recorded in the documents',
  [VerificationCheckKind.NO_ENCUMBRANCE_FOUND]:
    'No mortgage, lien or legal dispute found on the encumbrance certificate',
  [VerificationCheckKind.RERA_REGISTERED]: 'Project is registered with TS-RERA',

  // --- Builder projects ---
  //
  // Worded for a buyer reading the public badge, not for staff. Someone
  // deciding on an unbuilt flat needs to understand what was actually checked.
  [VerificationCheckKind.PROJECT_RERA_VALID]:
    'Project is registered with TS-RERA and the registration is current',
  [VerificationCheckKind.PROJECT_PLAN_SANCTIONED]:
    'Building plan is sanctioned by the competent authority',
  [VerificationCheckKind.PROJECT_COMMENCEMENT_CERTIFICATE]:
    'Commencement certificate has been issued',
  [VerificationCheckKind.PROJECT_LAND_TITLE_CLEAR]:
    'Land title is clear and the builder holds development rights',
  [VerificationCheckKind.PROJECT_OCCUPANCY_CERTIFICATE]:
    'Occupancy certificate has been issued',
};
