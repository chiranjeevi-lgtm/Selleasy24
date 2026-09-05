import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@kamala/db';

import { Public, Roles } from '../../common/auth/auth.decorators';
import { ScoringService } from './scoring.service';

/**
 * Investment score is a public trust signal on every listing / project
 * card, so the read endpoints are open. Compute triggers are admin-gated
 * because scoring the whole inventory is a full-scan job that will grow
 * meaningfully as inventory does.
 */

const SCORING_ADMIN_ROLES = [Role.ADMIN, Role.SUPER_ADMIN] as const;

@ApiTags('scoring')
@Controller()
export class ScoringController {
  constructor(private readonly scoring: ScoringService) {}

  // -------------------------------------------------------------------------
  // Public — buyer sees this on the "Why 82?" panel
  // -------------------------------------------------------------------------

  @Get('listings/:id/investment-score')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: 'Investment score + full breakdown for a listing',
    description:
      'Returns every component with its actual value, max, and rationale. This is the "Why 82?" panel — nothing about the score is a black box.',
  })
  async listingBreakdown(@Param('id', ParseUUIDPipe) id: string) {
    return this.scoring.getListingBreakdown(id);
  }

  @Get('projects/:id/investment-score')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Investment score + breakdown for a project' })
  async projectBreakdown(@Param('id', ParseUUIDPipe) id: string) {
    return this.scoring.getProjectBreakdown(id);
  }

  // -------------------------------------------------------------------------
  // Admin — batch and single-item triggers. The verifier flow will call
  // computeListingScore directly (once VerificationService is wired to
  // ScoringModule in a follow-up); these endpoints are for ops manual
  // recompute and the nightly job's entry point.
  // -------------------------------------------------------------------------

  @Post('admin/scoring/listings/:id')
  @Roles(...SCORING_ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recompute one listing\'s score' })
  async recomputeListing(@Param('id', ParseUUIDPipe) id: string) {
    return this.scoring.computeListingScore(id);
  }

  @Post('admin/scoring/projects/:id')
  @Roles(...SCORING_ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recompute one project\'s score' })
  async recomputeProject(@Param('id', ParseUUIDPipe) id: string) {
    return this.scoring.computeProjectScore(id);
  }

  @Post('admin/scoring/listings')
  @Roles(...SCORING_ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Batch recompute — every approved listing' })
  async recomputeAllListings() {
    return this.scoring.computeAllListings();
  }

  @Post('admin/scoring/projects')
  @Roles(...SCORING_ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Batch recompute — every approved project' })
  async recomputeAllProjects() {
    return this.scoring.computeAllProjects();
  }
}
