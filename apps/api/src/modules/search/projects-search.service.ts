import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  ProjectStage,
  PUBLIC_PROJECT_DETAIL_SELECT,
  PUBLIC_PROJECT_SELECT,
  publicProjectWhere,
} from '@kamala/db';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { Env } from '../../config/env.schema';
import type { ProjectSearchDto } from '../projects/projects.dto';

/**
 * Stage ordering for the public list.
 *
 * Not alphabetical and not the enum's declaration order. A buyer browsing new
 * construction wants what they can actually move into first, then what is close,
 * and delivered projects last — those are track record, not inventory.
 */
const STAGE_RANK: Record<ProjectStage, number> = {
  [ProjectStage.READY_TO_MOVE]: 0,
  [ProjectStage.NEARING_POSSESSION]: 1,
  [ProjectStage.UNDER_CONSTRUCTION]: 2,
  [ProjectStage.PRE_LAUNCH]: 3,
  [ProjectStage.DELIVERED]: 4,
};

@Injectable()
export class ProjectsSearchService {
  private readonly logger = new Logger(ProjectsSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Public project search.
   *
   * Plain Prisma rather than the raw-SQL path the listing search uses: there is
   * no full-text relevance ranking here, so the reason that query is raw does
   * not apply, and a typed query is the safer default.
   */
  async search(query: ProjectSearchDto) {
    /*
     * Price and bedroom filters apply to the *units*, not the project, so both
     * are expressed as a `some` on the relation. A project matches if any of its
     * configurations does — which is what a buyer filtering "3 BHK under ₹1.5
     * Cr" means.
     */
    const unitConditions: Prisma.ProjectUnitWhereInput = {
      ...(query.bedrooms !== undefined && { bedrooms: query.bedrooms }),
      ...((query.minPrice !== undefined || query.maxPrice !== undefined) && {
        priceFrom: {
          ...(query.minPrice !== undefined && { gte: new Prisma.Decimal(query.minPrice) }),
          ...(query.maxPrice !== undefined && { lte: new Prisma.Decimal(query.maxPrice) }),
        },
      }),
    };

    const where = publicProjectWhere({
      ...(query.stage && { stage: query.stage }),
      ...(query.locality && {
        neighborhood: { name: { equals: query.locality, mode: 'insensitive' } },
      }),
      ...(Object.keys(unitConditions).length > 0 && { units: { some: unitConditions } }),
    });

    const [total, rows] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        select: PUBLIC_PROJECT_SELECT,
        // Newest first within the ordering applied below. `firstListedAt` rather
        // than `createdAt`: a project drafted months ago and approved yesterday
        // is new to buyers today.
        orderBy: { firstListedAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
    ]);

    /*
     * Stage ordering is applied in memory rather than in SQL. Postgres sorts an
     * enum by its declaration order, which here would put PRE_LAUNCH first —
     * exactly backwards for a buyer. A CASE expression would fix that but needs
     * raw SQL, and the page size is capped at 50, so sorting the page is both
     * simpler and cheap.
     *
     * The consequence is that ordering is within-page, not global. Acceptable
     * while inventory is small; worth revisiting if project counts grow past a
     * few pages.
     */
    const items = rows
      .slice()
      .sort((a, b) => STAGE_RANK[a.stage] - STAGE_RANK[b.stage])
      .map((project) => this.toCard(project));

    return { total, items, limit: query.limit, offset: query.offset };
  }

  async getPublicProject(
    projectId: string,
    viewer: { ip?: string | undefined; userAgent?: string | undefined; userId?: string | undefined },
  ) {
    const project = await this.prisma.project.findFirst({
      where: publicProjectWhere({ id: projectId }),
      select: PUBLIC_PROJECT_DETAIL_SELECT,
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    // A builder browsing their own project should not inflate its count.
    if (viewer.userId !== project.builder.id) {
      await this.recordView(projectId, viewer);
    }

    const card = this.toCard(project);

    return {
      ...card,
      description: project.description,
      landAreaAcres: project.landAreaAcres === null ? null : Number(project.landAreaAcres),
      approvingAuthority: project.approvingAuthority,
      amenities: project.amenities,
      units: project.units.map((unit) => ({
        id: unit.id,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        balconies: unit.balconies,
        areaSqft: unit.areaSqft,
        carpetAreaSqft: unit.carpetAreaSqft,
        priceFrom: Number(unit.priceFrom),
        totalUnits: unit.totalUnits,
        availableUnits: unit.availableUnits,
        floorPlanUrl: unit.floorPlanKey ? this.storage.publicUrl(unit.floorPlanKey) : null,
      })),
    };
  }

  /**
   * Shapes a project for a card.
   *
   * The headline figures a buyer scans — "from ₹X", "2, 3 BHK" — are derived
   * from the units rather than stored on the project, so there is nothing to
   * keep in sync when a configuration changes.
   */
  private toCard(project: {
    id: string;
    name: string;
    stage: ProjectStage;
    address: string;
    pincode: string;
    possessionDate: Date | null;
    deliveredOn: Date | null;
    reraNumber: string;
    isVerified: boolean;
    firstListedAt: Date | null;
    verifiedAt: Date | null;
    totalTowers: number | null;
    totalUnits: number | null;
    neighborhood: { id: string; name: string; city: string; pincode: string };
    photos: Array<{ id: string; storageKey: string; sortOrder: number; isRender: boolean }>;
    units: Array<{ id: string; bedrooms: number; areaSqft: number; priceFrom: Prisma.Decimal }>;
    builder: { id: string; fullName: string; reraNumber: string | null };
  }) {
    const prices = project.units.map((unit) => Number(unit.priceFrom));
    const bedrooms = [...new Set(project.units.map((unit) => unit.bedrooms))].sort(
      (a, b) => a - b,
    );

    return {
      id: project.id,
      name: project.name,
      stage: project.stage,
      address: project.address,
      pincode: project.pincode,
      locality: project.neighborhood.name,
      city: project.neighborhood.city,
      possessionDate: project.possessionDate,
      deliveredOn: project.deliveredOn,
      reraNumber: project.reraNumber,
      isVerified: project.isVerified,
      firstListedAt: project.firstListedAt,
      verifiedAt: project.verifiedAt,
      totalTowers: project.totalTowers,
      totalUnits: project.totalUnits,
      // Null rather than 0 when a project somehow has no units — a "from ₹0"
      // headline is worse than none.
      priceFrom: prices.length > 0 ? Math.min(...prices) : null,
      priceTo: prices.length > 0 ? Math.max(...prices) : null,
      bedrooms,
      builder: {
        id: project.builder.id,
        name: project.builder.fullName,
        reraNumber: project.builder.reraNumber,
      },
      photos: project.photos.map((photo) => ({
        id: photo.id,
        url: this.storage.publicUrl(photo.storageKey),
        isRender: photo.isRender,
      })),
    };
  }

  /**
   * One view per viewer per day.
   *
   * Same salted-hash approach as listing views — a raw IP is personal data we
   * have no need to store, and the daily bucket is what makes the count mean
   * "people" rather than "page loads".
   */
  private async recordView(
    projectId: string,
    viewer: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<void> {
    const salt = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const dayKey = new Date().toISOString().slice(0, 10);

    const sessionHash = createHash('sha256')
      .update(`${salt}|${viewer.ip ?? 'unknown'}|${viewer.userAgent ?? 'unknown'}|${dayKey}`)
      .digest('hex');

    const viewedOn = new Date(`${dayKey}T00:00:00.000Z`);

    try {
      await this.prisma.$transaction([
        this.prisma.projectView.create({ data: { projectId, sessionHash, viewedOn } }),
        this.prisma.project.update({
          where: { id: projectId },
          data: { viewsCount: { increment: 1 } },
        }),
      ]);
    } catch (error) {
      // P2002 = repeat view today. Expected and silent.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return;
      }
      // Any other failure must not break the page — a view count is not worth a
      // 500 on a project detail request.
      this.logger.warn(
        `Project view recording failed for ${projectId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
