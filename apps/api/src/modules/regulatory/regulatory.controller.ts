import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@kamala/db';

import {
  CurrentUser,
  Public,
  Roles,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  registrationListQuerySchema,
  upsertRegistrationSchema,
  type RegistrationListQueryDto,
  type UpsertRegistrationDto,
} from './regulatory.dto';
import { RegulatoryService } from './regulatory.service';

/**
 * Regulatory reference data — TSRERA registrations today, HMDA/GHMC later.
 *
 * The public lookup is the entire trust story: a buyer can hit
 * /regulatory/rera/:number for any registration number on a card and see
 * exactly what SellEasy24 has on file. If it says NOT_FOUND, that IS the
 * signal — Square Yards' cards render a "verified" badge with no timestamp
 * and no lookup surface at all, and that is precisely the differentiator
 * this endpoint exists to enforce.
 */

const ADMIN_ROLES = [Role.ADMIN, Role.SUPER_ADMIN] as const;

@ApiTags('regulatory')
@Controller()
export class RegulatoryController {
  constructor(private readonly regulatory: RegulatoryService) {}

  // -------------------------------------------------------------------------
  // Public — the lookup a buyer's card triggers
  // -------------------------------------------------------------------------

  /**
   * Look up a registration by number.
   *
   * Returns a structured NOT_FOUND rather than a 404 so callers can render
   * "no matching record" as a trust signal on the listing card — the
   * consumer of this endpoint always wants to render something, never to
   * catch an exception.
   */
  @Get('regulatory/rera/:number')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({
    summary: 'Look up a RERA / regulatory registration by number',
    description:
      'Always returns 200. status=NOT_FOUND means no record on file; status=EXPIRED means the registration has lapsed. Callers should render every case.',
  })
  async check(@Param('number') registrationNumber: string) {
    return this.regulatory.check(registrationNumber);
  }

  // -------------------------------------------------------------------------
  // Admin — CRUD used by the ops console
  // -------------------------------------------------------------------------

  @Post('admin/regulatory/rera')
  @Roles(...ADMIN_ROLES)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create or update a regulatory registration (upsert by number)',
    description:
      'Idempotent on the registration number. Used by the ops console today and by the nightly TSRERA sync (once Karza / manual scraper is wired) — both call the same endpoint.',
  })
  async upsert(
    @Body(new ZodValidationPipe(upsertRegistrationSchema)) dto: UpsertRegistrationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.regulatory.upsert(user.id, dto);
  }

  @Get('admin/regulatory/rera')
  @Roles(...ADMIN_ROLES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List regulatory registrations (paginated, filterable)' })
  async list(
    @Query(new ZodValidationPipe(registrationListQuerySchema))
    query: RegistrationListQueryDto,
  ) {
    return this.regulatory.list(query);
  }

  @Get('admin/regulatory/rera/:id')
  @Roles(...ADMIN_ROLES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get one registration by id' })
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.regulatory.findById(id);
  }
}
