import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentKind,
  Prisma,
  ProjectStatus,
  type Project,
} from '@kamala/db';
import { randomUUID } from 'node:crypto';

import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import {
  MAX_PHOTOS,
  MIN_PHOTOS,
  validatePhoto,
} from '../../common/storage/file-validation';
import type { RequestContext } from '../auth/auth.service';
import {
  BUILDER_PROJECT_FIELDS,
  COMPLETED_STAGES,
  REQUIRED_ON_COMPLETION,
  REQUIRED_PROJECT_DOCUMENTS,
  type CreateProjectDto,
  type ProjectUnitDto,
  type UpdateProjectDto,
} from './projects.dto';

/**
 * Copies across only the keys the caller actually supplied.
 *
 * Same reasoning as the listings service: an absent key and one explicitly set
 * to `undefined` are identical to Prisma, so filtering here keeps "leave alone"
 * and "clear" from being written the same way by accident.
 */
function pickDefined<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const result: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * States in which a builder may still edit a project.
 *
 * APPROVED is excluded for the same reason it is on a listing: editing behind
 * the badge would let a builder get a modest project approved and then change
 * what it claims. A change to a live project needs re-review.
 */
const EDITABLE_STATUSES: readonly ProjectStatus[] = [
  ProjectStatus.DRAFT,
  ProjectStatus.REJECTED,
];

const DOCUMENT_LABELS: Partial<Record<DocumentKind, string>> = {
  [DocumentKind.RERA_CERTIFICATE]: 'TS-RERA registration certificate',
  [DocumentKind.APPROVED_PLAN]: 'Sanctioned building plan',
  [DocumentKind.OCCUPANCY_CERTIFICATE]: 'Occupancy certificate',
  [DocumentKind.COMPLETION_CERTIFICATE]: 'Completion certificate',
  [DocumentKind.NOC]: 'No-objection certificate',
};

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Creation and editing
  // -------------------------------------------------------------------------

  async create(
    builderId: string,
    dto: CreateProjectDto,
    ctx: RequestContext,
  ): Promise<Project> {
    const neighborhood = await this.prisma.neighborhood.findUnique({
      where: { id: dto.neighborhoodId },
      select: { id: true, name: true },
    });

    if (!neighborhood) {
      throw new BadRequestException('Unknown locality.');
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          ...pickDefined(dto, BUILDER_PROJECT_FIELDS),
          builderId,
          // Named explicitly rather than left to the spread so the required
          // columns are provably satisfied without a cast.
          name: dto.name,
          description: dto.description,
          address: dto.address,
          pincode: dto.pincode,
          stage: dto.stage,
          reraNumber: dto.reraNumber,
          neighborhoodId: neighborhood.id,
          ...(dto.landAreaAcres !== undefined && {
            landAreaAcres: new Prisma.Decimal(dto.landAreaAcres),
          }),
          status: ProjectStatus.DRAFT,
          // firstListedAt stays null until first approval — the honest
          // "launched N days ago" anchor, never set here.
        },
      });

      await this.audit.recordInTransaction(tx, {
        actorId: builderId,
        action: AuditAction.PROJECT_CREATED,
        entityType: 'project',
        entityId: created.id,
        metadata: {
          locality: neighborhood.name,
          stage: dto.stage,
          reraNumber: dto.reraNumber,
        },
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      return created;
    });
  }

  async update(
    builderId: string,
    projectId: string,
    dto: UpdateProjectDto,
    ctx: RequestContext,
  ): Promise<Project> {
    const project = await this.assertOwnedByBuilder(projectId, builderId);
    this.assertEditable(project);

    if (dto.neighborhoodId !== undefined) {
      const exists = await this.prisma.neighborhood.findUnique({
        where: { id: dto.neighborhoodId },
        select: { id: true },
      });
      if (!exists) {
        throw new BadRequestException('Unknown locality.');
      }
    }

    /*
     * Cross-field rules are checked in the DTO against the *submitted* fields
     * only. On a partial update that is not enough: moving a project from
     * UNDER_CONSTRUCTION to DELIVERED without sending `deliveredOn` would pass
     * the schema and leave a delivered project with no handover date. Merge the
     * change over what is stored and re-check the combination.
     */
    const merged = {
      stage: dto.stage ?? project.stage,
      possessionDate: dto.possessionDate ?? project.possessionDate ?? undefined,
      deliveredOn: dto.deliveredOn ?? project.deliveredOn ?? undefined,
    };

    if (merged.deliveredOn && merged.stage !== 'DELIVERED') {
      throw new BadRequestException('Only a delivered project can carry a handover date.');
    }

    if (!COMPLETED_STAGES.includes(merged.stage) && !merged.possessionDate) {
      throw new BadRequestException(
        'Give the expected possession date for an unfinished project.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id: projectId },
        data: {
          ...pickDefined(dto, BUILDER_PROJECT_FIELDS),
          ...(dto.neighborhoodId !== undefined && { neighborhoodId: dto.neighborhoodId }),
          ...(dto.landAreaAcres !== undefined && {
            landAreaAcres: new Prisma.Decimal(dto.landAreaAcres),
          }),
          // Editing a rejected project returns it to draft and clears the stale
          // reason, so the builder is not shown an outdated failure.
          ...(project.status === ProjectStatus.REJECTED && {
            status: ProjectStatus.DRAFT,
            rejectionReason: null,
          }),
        },
      });

      await this.audit.recordInTransaction(tx, {
        actorId: builderId,
        action: AuditAction.PROJECT_UPDATED,
        entityType: 'project',
        entityId: projectId,
        metadata: { fields: Object.keys(dto) },
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Units
  // -------------------------------------------------------------------------

  /**
   * Replaces the project's unit configurations wholesale.
   *
   * Delete-then-create inside one transaction rather than a diff: the rows carry
   * no history worth preserving, and a diff would have to reconcile ids the
   * client may have invented. Floor plans are the exception — those are files,
   * so their keys are carried across by matching configuration.
   */
  async setUnits(
    builderId: string,
    projectId: string,
    units: ProjectUnitDto[],
    ctx: RequestContext,
  ) {
    const project = await this.assertOwnedByBuilder(projectId, builderId);
    this.assertEditable(project);

    // Two rows describing the same configuration make "from ₹X" ambiguous and
    // are always a mistake in the form rather than a real intent.
    const seen = new Set<string>();
    for (const unit of units) {
      const key = `${unit.bedrooms}-${unit.areaSqft}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          `Two configurations both say ${unit.bedrooms} BHK at ${unit.areaSqft} sq ft. Combine them.`,
        );
      }
      seen.add(key);
    }

    const existing = await this.prisma.projectUnit.findMany({
      where: { projectId },
      select: { bedrooms: true, areaSqft: true, floorPlanKey: true },
    });
    const planByConfig = new Map(
      existing
        .filter((unit) => unit.floorPlanKey !== null)
        .map((unit) => [`${unit.bedrooms}-${unit.areaSqft}`, unit.floorPlanKey!]),
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.projectUnit.deleteMany({ where: { projectId } });

      await tx.projectUnit.createMany({
        data: units.map((unit) => ({
          projectId,
          bedrooms: unit.bedrooms,
          bathrooms: unit.bathrooms,
          balconies: unit.balconies ?? null,
          areaSqft: unit.areaSqft,
          carpetAreaSqft: unit.carpetAreaSqft ?? null,
          priceFrom: new Prisma.Decimal(unit.priceFrom),
          totalUnits: unit.totalUnits ?? null,
          availableUnits: unit.availableUnits ?? null,
          floorPlanKey: planByConfig.get(`${unit.bedrooms}-${unit.areaSqft}`) ?? null,
        })),
      });

      await this.audit.recordInTransaction(tx, {
        actorId: builderId,
        action: AuditAction.PROJECT_UPDATED,
        entityType: 'project',
        entityId: projectId,
        metadata: { unitConfigurations: units.length },
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      return tx.projectUnit.findMany({
        where: { projectId },
        orderBy: { priceFrom: 'asc' },
      });
    });
  }

  // -------------------------------------------------------------------------
  // Photos
  // -------------------------------------------------------------------------

  async addPhoto(
    builderId: string,
    projectId: string,
    isRender: boolean,
    file: Express.Multer.File | undefined,
  ): Promise<{ id: string; url: string; sortOrder: number; isRender: boolean }> {
    const project = await this.assertOwnedByBuilder(projectId, builderId);
    this.assertEditable(project);

    const existingCount = await this.prisma.projectPhoto.count({ where: { projectId } });
    if (existingCount >= MAX_PHOTOS) {
      throw new BadRequestException(`A project may have at most ${MAX_PHOTOS} photos.`);
    }

    const photo = validatePhoto(file);

    // Generated key, never derived from the client filename.
    const key = `projects/${projectId}/photos/${randomUUID()}.${photo.extension}`;

    await this.storage.put({
      bucket: 'public',
      key,
      body: photo.buffer,
      contentType: photo.mimeType,
    });

    const created = await this.prisma.projectPhoto.create({
      data: {
        projectId,
        storageKey: key,
        sortOrder: existingCount,
        isRender,
      },
    });

    return {
      id: created.id,
      url: this.storage.publicUrl(key),
      sortOrder: created.sortOrder,
      isRender: created.isRender,
    };
  }

  async deletePhoto(builderId: string, projectId: string, photoId: string): Promise<void> {
    const project = await this.assertOwnedByBuilder(projectId, builderId);
    this.assertEditable(project);

    const photo = await this.prisma.projectPhoto.findFirst({
      where: { id: photoId, projectId },
    });

    if (!photo) {
      throw new NotFoundException('Photo not found.');
    }

    await this.prisma.projectPhoto.delete({ where: { id: photo.id } });

    try {
      await this.storage.delete('public', photo.storageKey);
    } catch (error) {
      this.logger.warn(
        `Orphaned storage object ${photo.storageKey}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  /**
   * Sets photo display order. First is the cover.
   *
   * Not gated by `assertEditable`, matching listings: reordering changes only
   * presentation, and every photograph the officer reviewed is still there.
   */
  async reorderPhotos(
    builderId: string,
    projectId: string,
    order: string[],
  ): Promise<Array<{ id: string; url: string; sortOrder: number }>> {
    await this.assertOwnedByBuilder(projectId, builderId);

    const existing = await this.prisma.projectPhoto.findMany({
      where: { projectId },
      select: { id: true, storageKey: true },
    });

    const known = new Set(existing.map((photo) => photo.id));
    if (order.length !== existing.length || order.some((id) => !known.has(id))) {
      throw new BadRequestException(
        'Send every photo on this project exactly once, in the order you want them shown.',
      );
    }

    const keyById = new Map(existing.map((photo) => [photo.id, photo.storageKey]));

    await this.prisma.$transaction(
      order.map((id, index) =>
        this.prisma.projectPhoto.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    return order.map((id, index) => ({
      id,
      url: this.storage.publicUrl(keyById.get(id)!),
      sortOrder: index,
    }));
  }

  // -------------------------------------------------------------------------
  // Submission
  // -------------------------------------------------------------------------

  /**
   * Submits a project for verification.
   *
   * Every precondition here is something the officer needs in order to do the
   * job at all. Rejecting incomplete submissions at this boundary is what keeps
   * the queue meaningful.
   */
  async submit(builderId: string, projectId: string, ctx: RequestContext): Promise<Project> {
    const project = await this.assertOwnedByBuilder(projectId, builderId);

    if (project.status === ProjectStatus.PENDING_REVIEW) {
      throw new BadRequestException('This project is already awaiting review.');
    }
    this.assertEditable(project);

    const builder = await this.prisma.user.findUniqueOrThrow({
      where: { id: builderId },
      select: { phone: true, isPhoneVerified: true },
    });

    if (!builder.phone) {
      throw new BadRequestException(
        'Add a phone number to your profile before submitting a project.',
      );
    }

    if (!builder.isPhoneVerified) {
      throw new BadRequestException(
        'Verify your phone number before submitting a project. Buyers reach you on this number.',
      );
    }

    const unitCount = await this.prisma.projectUnit.count({ where: { projectId } });
    if (unitCount === 0) {
      throw new BadRequestException(
        'Add at least one unit configuration before submitting.',
      );
    }

    const photoCount = await this.prisma.projectPhoto.count({ where: { projectId } });
    if (photoCount < MIN_PHOTOS) {
      throw new BadRequestException(
        `At least ${MIN_PHOTOS} photos are required (currently ${photoCount}).`,
      );
    }

    /*
     * An occupancy certificate is what makes "ready to move" true. Requiring it
     * only when the builder makes that claim keeps an under-construction project
     * submittable while closing the gap that lets a project advertise
     * possession it cannot legally offer.
     */
    const required = [
      ...REQUIRED_PROJECT_DOCUMENTS,
      ...(COMPLETED_STAGES.includes(project.stage) ? REQUIRED_ON_COMPLETION : []),
    ];

    const documents = await this.prisma.projectDocument.findMany({
      where: { projectId, deletedAt: null },
      select: { kind: true },
    });
    const present = new Set(documents.map((d) => d.kind));
    const missing = required.filter((kind) => !present.has(kind));

    if (missing.length > 0) {
      throw new BadRequestException({
        message: 'Required documents are missing.',
        errors: missing.map((kind) => ({
          field: 'documents',
          message: DOCUMENT_LABELS[kind] ?? kind,
        })),
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const submitted = await tx.project.update({
        where: { id: projectId },
        data: {
          status: ProjectStatus.PENDING_REVIEW,
          submittedAt: new Date(),
          rejectionReason: null,
          revisionNote: null,
        },
      });

      await this.audit.recordInTransaction(tx, {
        actorId: builderId,
        action: AuditAction.PROJECT_SUBMITTED,
        entityType: 'project',
        entityId: projectId,
        metadata: { photoCount, unitCount, documentKinds: [...present] },
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      return submitted;
    });
  }

  // -------------------------------------------------------------------------
  // Builder views
  // -------------------------------------------------------------------------

  /**
   * The builder's own portfolio, any status.
   *
   * Split by whether the project is finished rather than returned as one flat
   * list: a builder's live inventory and their delivered track record are two
   * different things, used for two different purposes.
   */
  async listMine(builderId: string) {
    const projects = await this.prisma.project.findMany({
      where: { builderId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        stage: true,
        status: true,
        isVerified: true,
        address: true,
        possessionDate: true,
        deliveredOn: true,
        reraNumber: true,
        totalTowers: true,
        totalUnits: true,
        submittedAt: true,
        verifiedAt: true,
        firstListedAt: true,
        rejectionReason: true,
        revisionNote: true,
        viewsCount: true,
        leadsCount: true,
        createdAt: true,
        neighborhood: { select: { name: true, city: true } },
        units: {
          select: {
            bedrooms: true,
            priceFrom: true,
            totalUnits: true,
            availableUnits: true,
          },
          orderBy: { priceFrom: 'asc' },
        },
        photos: {
          select: { storageKey: true },
          orderBy: { sortOrder: 'asc' },
          take: 1,
        },
        _count: { select: { photos: true, documents: true, units: true } },
      },
    });

    return projects.map((project) => ({
      ...project,
      photos: undefined,
      coverUrl: project.photos[0]
        ? this.storage.publicUrl(project.photos[0].storageKey)
        : null,
      /*
       * Remaining inventory across the whole project. Null rather than 0 when no
       * configuration records availability — "we did not say" and "none left"
       * are very different, and showing the second for the first would tell a
       * buyer the project is sold out when nobody claimed that.
       */
      availableUnits: project.units.some((unit) => unit.availableUnits !== null)
        ? project.units.reduce((sum, unit) => sum + (unit.availableUnits ?? 0), 0)
        : null,
      priceFrom: project.units[0]?.priceFrom ?? null,
    }));
  }

  async getMine(builderId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, builderId },
      include: {
        neighborhood: true,
        units: { orderBy: { priceFrom: 'asc' } },
        photos: { orderBy: { sortOrder: 'asc' } },
        documents: {
          where: { deletedAt: null },
          select: {
            id: true,
            kind: true,
            originalFilename: true,
            sizeBytes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        verifications: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            decision: true,
            reason: true,
            createdAt: true,
            checks: { select: { kind: true, passed: true, note: true } },
            // internalNotes deliberately absent — staff commentary is never
            // returned on a builder-facing endpoint.
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    return {
      ...project,
      photos: project.photos.map((photo) => ({
        id: photo.id,
        sortOrder: photo.sortOrder,
        isRender: photo.isRender,
        url: this.storage.publicUrl(photo.storageKey),
      })),
      units: project.units.map((unit) => ({
        ...unit,
        floorPlanUrl: unit.floorPlanKey ? this.storage.publicUrl(unit.floorPlanKey) : null,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Ownership check.
   *
   * Returns 404 rather than 403 for a project belonging to someone else: a
   * distinct "forbidden" would confirm the id exists, letting a builder
   * enumerate a competitor's portfolio.
   */
  private async assertOwnedByBuilder(projectId: string, builderId: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });

    if (!project || project.builderId !== builderId) {
      throw new NotFoundException('Project not found.');
    }

    return project;
  }

  private assertEditable(project: Project): void {
    if (!EDITABLE_STATUSES.includes(project.status)) {
      throw new ForbiddenException(
        project.status === ProjectStatus.PENDING_REVIEW
          ? 'This project is awaiting review and cannot be changed.'
          : 'A live project cannot be edited. Contact us to request a change.',
      );
    }
  }
}
