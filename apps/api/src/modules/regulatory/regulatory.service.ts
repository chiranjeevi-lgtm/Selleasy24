import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RegulatoryAuthority, RegulatoryStatus } from '@kamala/db';

import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  RegistrationListQueryDto,
  UpsertRegistrationDto,
} from './regulatory.dto';

/**
 * The result of a public RERA-status check. `status` mirrors the enum from
 * the DB but adds NOT_FOUND — a lookup that returned nothing is not the
 * same as one that found an expired record, and buyers making a decision
 * on it need to see the difference.
 */
export interface RegistrationCheckResult {
  found: boolean;
  authority: RegulatoryAuthority | null;
  registrationNumber: string;
  status: RegulatoryStatus | 'NOT_FOUND';
  projectName: string | null;
  promoterName: string | null;
  registeredOn: string | null;
  expiresOn: string | null;
  /** Is the registration currently within its validity period? */
  isCurrent: boolean;
  syncedAt: string | null;
}

@Injectable()
export class RegulatoryService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Public lookup — used by verifier UI, listing/project detail, scoring
  // -------------------------------------------------------------------------

  /**
   * The one function every other module calls when it needs to know whether
   * a RERA number is real. Deliberately returns a structured "not found"
   * rather than throwing, so callers can render it as a public trust signal
   * ("registration not on file") rather than a 500.
   */
  async check(registrationNumber: string): Promise<RegistrationCheckResult> {
    const normalised = registrationNumber.trim();
    const record = await this.prisma.regulatoryRegistration.findUnique({
      where: { registrationNumber: normalised },
    });

    if (!record) {
      return {
        found: false,
        authority: null,
        registrationNumber: normalised,
        status: 'NOT_FOUND',
        projectName: null,
        promoterName: null,
        registeredOn: null,
        expiresOn: null,
        isCurrent: false,
        syncedAt: null,
      };
    }

    const now = new Date();
    const isCurrent =
      record.status === RegulatoryStatus.ACTIVE &&
      (record.expiresOn === null || record.expiresOn > now);

    return {
      found: true,
      authority: record.authority,
      registrationNumber: record.registrationNumber,
      status: record.status,
      projectName: record.projectName,
      promoterName: record.promoterName,
      registeredOn: record.registeredOn.toISOString().slice(0, 10),
      expiresOn: record.expiresOn?.toISOString().slice(0, 10) ?? null,
      isCurrent,
      syncedAt: record.syncedAt.toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Admin — CRUD used by the operations console and (later) by the nightly
  // scraper that syncs the TSRERA portal
  // -------------------------------------------------------------------------

  async upsert(syncedById: string | null, dto: UpsertRegistrationDto) {
    try {
      const record = await this.prisma.regulatoryRegistration.upsert({
        where: { registrationNumber: dto.registrationNumber },
        create: {
          authority: dto.authority,
          registrationNumber: dto.registrationNumber,
          projectName: dto.projectName,
          promoterName: dto.promoterName,
          towerPhases: dto.towerPhases ?? null,
          totalUnits: dto.totalUnits ?? null,
          registeredOn: dto.registeredOn,
          expiresOn: dto.expiresOn ?? null,
          status: dto.status,
          approvalNotes: dto.approvalNotes ?? null,
          syncedById,
        },
        update: {
          authority: dto.authority,
          projectName: dto.projectName,
          promoterName: dto.promoterName,
          towerPhases: dto.towerPhases ?? null,
          totalUnits: dto.totalUnits ?? null,
          registeredOn: dto.registeredOn,
          expiresOn: dto.expiresOn ?? null,
          status: dto.status,
          approvalNotes: dto.approvalNotes ?? null,
          syncedById,
          syncedAt: new Date(),
        },
      });
      return record;
    } catch (error) {
      // Very defensive — the unique constraint is the whole design, but if
      // Prisma somehow surfaces P2002 despite the upsert, we should not
      // return an opaque 500.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new Error('Registration number conflict on upsert — inspect the record manually');
      }
      throw error;
    }
  }

  async list(query: RegistrationListQueryDto) {
    const where: Prisma.RegulatoryRegistrationWhereInput = {
      ...(query.authority && { authority: query.authority }),
      ...(query.status && { status: query.status }),
      ...(query.q && {
        OR: [
          { projectName: { contains: query.q, mode: 'insensitive' } },
          { promoterName: { contains: query.q, mode: 'insensitive' } },
          { registrationNumber: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.regulatoryRegistration.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.regulatoryRegistration.count({ where }),
    ]);

    return { total, limit: query.limit, offset: query.offset, items };
  }

  async findById(id: string) {
    const record = await this.prisma.regulatoryRegistration.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Registration not found');
    return record;
  }
}
