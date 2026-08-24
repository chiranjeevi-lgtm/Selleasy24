import {
  Amenity,
  ApprovingAuthority,
  DocumentKind,
  ProjectStage,
} from '@kamala/db';
import { z } from 'zod';

import { MAX_PHOTOS } from '../../common/storage/file-validation';

const pincodeSchema = z
  .string()
  .regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit Indian pincode');

/**
 * TS-RERA project registration.
 *
 * Format is `P` followed by digits, e.g. P02400004567. Validated loosely on
 * purpose — the authoritative check is a human comparing this against the RERA
 * portal during verification, and a regex tight enough to reject a genuine
 * number would be worse than one that lets a typo through to review.
 */
const reraSchema = z
  .string()
  .trim()
  .min(8, 'Enter the full TS-RERA registration number')
  .max(40)
  .regex(/^[A-Za-z0-9/-]+$/, 'RERA numbers contain only letters, digits, hyphens and slashes');

/**
 * One configuration in a project.
 *
 * `priceFrom` rather than `price`: units differ by floor, facing and view, so a
 * builder quotes a starting figure. Anything that renders this must keep the
 * "from" or it becomes a promise the builder did not make.
 */
export const projectUnitSchema = z
  .object({
    bedrooms: z.number().int().min(0).max(20),
    bathrooms: z.number().int().min(0).max(20),
    balconies: z.number().int().min(0).max(10).optional(),
    areaSqft: z.number().int().min(100, 'Area looks too small').max(100_000),
    carpetAreaSqft: z.number().int().min(50).max(100_000).optional(),
    priceFrom: z
      .number()
      .int('Price must be a whole number of rupees')
      .min(100_000, 'Price must be at least ₹1,00,000')
      .max(10_000_000_000, 'Price exceeds the supported maximum'),
    totalUnits: z.number().int().min(1).max(10_000).optional(),
    availableUnits: z.number().int().min(0).max(10_000).optional(),
  })
  .superRefine((unit, ctx) => {
    if (
      unit.carpetAreaSqft !== undefined &&
      unit.carpetAreaSqft >= unit.areaSqft
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['carpetAreaSqft'],
        message: 'Carpet area must be smaller than built-up area',
      });
    }

    if (
      unit.availableUnits !== undefined &&
      unit.totalUnits !== undefined &&
      unit.availableUnits > unit.totalUnits
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['availableUnits'],
        message: 'Available units cannot exceed the total for this configuration',
      });
    }
  });

export type ProjectUnitDto = z.infer<typeof projectUnitSchema>;

/**
 * The project field set.
 *
 * Plain object so create and update can both derive from it — `.partial()` does
 * not exist on a refined schema, so the cross-field rules are applied separately
 * to each below, exactly as in the listings DTO.
 */
const projectFields = z.object({
  name: z.string().trim().min(3, 'Enter the project name').max(200),
  description: z
    .string()
    .trim()
    .min(50, 'Description must be at least 50 characters')
    .max(5000),

  // --- Location ---
  address: z.string().trim().min(10, 'Enter the full address').max(500),
  pincode: pincodeSchema,
  neighborhoodId: z.string().uuid('Select a locality from the list'),

  // --- Lifecycle ---
  stage: z.nativeEnum(ProjectStage),
  /**
   * Expected handover, or the actual date once delivered. A plain date string
   * rather than a datetime: nobody hands over a tower at 14:32.
   */
  possessionDate: z.coerce.date().optional(),
  deliveredOn: z.coerce.date().optional(),

  // --- Statutory ---
  reraNumber: reraSchema,
  approvingAuthority: z.nativeEnum(ApprovingAuthority).optional(),

  // --- Scale ---
  totalTowers: z.number().int().min(1).max(200).optional(),
  totalUnits: z.number().int().min(1).max(50_000).optional(),
  landAreaAcres: z.number().min(0.01).max(10_000).optional(),

  amenities: z
    .array(z.nativeEnum(Amenity))
    // `.max()` before `.refine()`: refine returns a ZodEffects with no array
    // methods, and chaining past it degrades every field here to `unknown`.
    .max(Object.keys(Amenity).length)
    .refine((list) => new Set(list).size === list.length, 'Amenities must be unique')
    .default([]),
});

type ProjectShape = Partial<z.infer<typeof projectFields>>;

/**
 * Stages at which a project is finished. Used by the rules below and by the
 * service when deciding which documents a submission must carry.
 */
export const COMPLETED_STAGES: readonly ProjectStage[] = [
  ProjectStage.READY_TO_MOVE,
  ProjectStage.DELIVERED,
];

function checkCrossFieldRules(value: ProjectShape, ctx: z.RefinementCtx): void {
  /*
   * A delivery date is a claim that the towers are standing and handed over.
   * Attaching one to a project still under construction is the kind of
   * detail nobody notices until a buyer relies on it.
   */
  if (
    value.deliveredOn !== undefined &&
    value.stage !== undefined &&
    value.stage !== ProjectStage.DELIVERED
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['deliveredOn'],
      message: 'Only a delivered project can carry a handover date',
    });
  }

  if (value.deliveredOn !== undefined && value.deliveredOn.getTime() > Date.now()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['deliveredOn'],
      message: 'A handover date cannot be in the future',
    });
  }

  // The converse: an unfinished project without a target handover leaves the
  // buyer with the one fact they most need missing.
  if (
    value.stage !== undefined &&
    !COMPLETED_STAGES.includes(value.stage) &&
    value.possessionDate === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['possessionDate'],
      message: 'Give the expected possession date for an unfinished project',
    });
  }
}

export const createProjectSchema = projectFields.superRefine((value, ctx) =>
  checkCrossFieldRules(value, ctx),
);

export type CreateProjectDto = z.infer<typeof createProjectSchema>;

/**
 * Updates.
 *
 * Every field optional, and the service refuses edits unless the project is in
 * DRAFT or REJECTED — an APPROVED project cannot be altered behind the badge,
 * for the same reason an approved listing cannot.
 */
export const updateProjectSchema = projectFields
  .partial()
  .superRefine((value, ctx) => checkCrossFieldRules(value, ctx));

export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;

/**
 * Project columns a builder controls, named once so create and update cannot
 * drift apart. `neighborhoodId` is absent deliberately: it needs an existence
 * check before it can be written, so the service handles it explicitly.
 */
export const BUILDER_PROJECT_FIELDS = [
  'name',
  'description',
  'address',
  'pincode',
  'stage',
  'possessionDate',
  'deliveredOn',
  'reraNumber',
  'approvingAuthority',
  'totalTowers',
  'totalUnits',
  'amenities',
] as const satisfies readonly (keyof UpdateProjectDto)[];

/**
 * Replaces the whole unit set in one call.
 *
 * A per-unit PATCH API would need the client to track ids across a form where
 * rows are added and removed freely, and two quick edits race into a state
 * neither side intended. Sending the full set makes the result unambiguous.
 */
export const setUnitsSchema = z.object({
  units: z
    .array(projectUnitSchema)
    .min(1, 'Add at least one configuration')
    .max(30, 'A project may have at most 30 configurations'),
});

export type SetUnitsDto = z.infer<typeof setUnitsSchema>;

export const reorderProjectPhotosSchema = z.object({
  order: z
    .array(z.string().uuid())
    .min(1, 'Send the photo order')
    .max(MAX_PHOTOS)
    .refine((ids) => new Set(ids).size === ids.length, 'A photo can appear only once'),
});

export type ReorderProjectPhotosDto = z.infer<typeof reorderProjectPhotosSchema>;

/**
 * A render and a site photograph are read very differently by a buyer, so the
 * distinction is recorded at upload rather than left to a caption.
 */
export const projectPhotoUploadSchema = z.object({
  isRender: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type ProjectPhotoUploadDto = z.infer<typeof projectPhotoUploadSchema>;

export const projectDocumentUploadSchema = z.object({
  kind: z.nativeEnum(DocumentKind),
});

export type ProjectDocumentUploadDto = z.infer<typeof projectDocumentUploadSchema>;

/**
 * Documents required before a project can be reviewed.
 *
 * RERA certificate and sanctioned plan always. The occupancy certificate is
 * required only once the builder claims the project is finished — it is the
 * document that makes "ready to move" true, and a project claiming READY_TO_MOVE
 * without one is exactly the misrepresentation verification exists to catch.
 */
export const REQUIRED_PROJECT_DOCUMENTS: readonly DocumentKind[] = [
  DocumentKind.RERA_CERTIFICATE,
  DocumentKind.APPROVED_PLAN,
];

export const REQUIRED_ON_COMPLETION: readonly DocumentKind[] = [
  DocumentKind.OCCUPANCY_CERTIFICATE,
];

/** Query for the public project list. */
export const projectSearchSchema = z.object({
  stage: z.nativeEnum(ProjectStage).optional(),
  locality: z.string().trim().max(120).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ProjectSearchDto = z.infer<typeof projectSearchSchema>;
