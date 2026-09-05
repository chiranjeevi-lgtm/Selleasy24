import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { CreateSavedSearchDto, ToggleAlertsDto } from './saved-searches.dto';

/**
 * A single buyer can save up to this many searches. Higher would let
 * someone spam-save every browse action; lower cuts a real use case
 * (buyer tracking 15 different localities). Twenty is empirically the
 * threshold at which a list stops being scannable anyway.
 */
const MAX_SAVED_PER_USER = 20;

@Injectable()
export class SavedSearchesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateSavedSearchDto) {
    const currentCount = await this.prisma.savedSearch.count({ where: { userId } });
    if (currentCount >= MAX_SAVED_PER_USER) {
      throw new ForbiddenException(
        `You have ${currentCount} saved searches — the maximum is ${MAX_SAVED_PER_USER}. Delete one to add another.`,
      );
    }

    return this.prisma.savedSearch.create({
      data: {
        userId,
        name: dto.name,
        queryString: dto.queryString,
        alertsEnabled: dto.alertsEnabled,
      },
      select: {
        id: true,
        name: true,
        queryString: true,
        alertsEnabled: true,
        lastNotifiedAt: true,
        createdAt: true,
      },
    });
  }

  async listMine(userId: string) {
    const rows = await this.prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        queryString: true,
        alertsEnabled: true,
        lastNotifiedAt: true,
        createdAt: true,
      },
    });
    return {
      items: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        lastNotifiedAt: r.lastNotifiedAt?.toISOString() ?? null,
      })),
    };
  }

  async toggleAlerts(userId: string, id: string, dto: ToggleAlertsDto) {
    const existing = await this.prisma.savedSearch.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) throw new NotFoundException('Saved search not found');
    if (existing.userId !== userId) {
      // Return 404 rather than 403 so an attacker cannot probe for other
      // users' search IDs by watching status codes.
      throw new NotFoundException('Saved search not found');
    }
    return this.prisma.savedSearch.update({
      where: { id },
      data: { alertsEnabled: dto.alertsEnabled },
      select: { id: true, alertsEnabled: true },
    });
  }

  async delete(userId: string, id: string) {
    const existing = await this.prisma.savedSearch.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) throw new NotFoundException('Saved search not found');
    if (existing.userId !== userId) {
      throw new NotFoundException('Saved search not found');
    }
    await this.prisma.savedSearch.delete({ where: { id } });
    return { deleted: true };
  }
}
