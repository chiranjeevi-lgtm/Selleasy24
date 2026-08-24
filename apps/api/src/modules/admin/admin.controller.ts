import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@kamala/db';
import { z } from 'zod';

import { Roles } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminService } from './admin.service';

/**
 * Window for the operations figures.
 *
 * Capped at a year because the response carries one row per day, so an
 * unbounded range would let a single request build an arbitrarily large
 * payload. Floored at seven so a "rate" is never computed from a day or two.
 */
const metricsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
});

type MetricsQueryDto = z.infer<typeof metricsQuerySchema>;

/**
 * Operations reporting.
 *
 * Open to everyone who works the queue rather than to administrators alone: the
 * SLA figures are the ones a verifier most needs to see, and hiding them from
 * the people who can act on them would be perverse.
 *
 * Everything here is aggregate. No endpoint on this controller returns a name,
 * an address or a phone number — a dashboard is not a route to personal data,
 * and keeping it counts-only means it can be left open on a screen in an
 * office.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.VERIFIER, Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('metrics')
  @ApiOperation({
    summary: 'Operations dashboard figures',
    description:
      'Verification SLA, the view-to-sale funnel, enquiry health, sales attribution, growth and inventory. Counts and rates only — never an identity. Medians carry the sample they were drawn from so a figure computed from three rows is not read as a finding.',
  })
  async metrics(
    @Query(new ZodValidationPipe(metricsQuerySchema)) query: MetricsQueryDto,
  ) {
    return this.admin.metrics(query.days);
  }
}
