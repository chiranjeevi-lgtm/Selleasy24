import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { Public, type AuthenticatedUser } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { projectSearchSchema, type ProjectSearchDto } from '../projects/projects.dto';
import { ProjectsSearchService } from './projects-search.service';
import {
  compareQuerySchema,
  searchQuerySchema,
  type CompareQueryDto,
  type SearchQueryDto,
} from './search.dto';
import { SearchService } from './search.service';

/**
 * Public discovery surface. Every route here is unauthenticated — buyers browse
 * before they register, which the PRD requires ("low-friction lead capture, no
 * signup required").
 *
 * Throttled to 60 requests/min — below the global 100/min because property
 * listings are scraped aggressively by competitors and this is the surface they
 * would target. Applied at the controller level so every route inherits it.
 */
@ApiTags('search')
@Public()
@Throttle({ default: { ttl: 60_000, limit: 60 } })
@Controller()
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly projects: ProjectsSearchService,
  ) {}

  @Get('localities')
  @ApiOperation({
    summary: 'Localities for search dropdowns',
    description: 'Fixed reference data. Location is never free text, so results stay consistent.',
  })
  async localities(@Query('city') city?: string) {
    return this.search.neighborhoods(city);
  }

  @Get('listings/search')
  @ApiOperation({
    summary: 'Search verified listings',
    description:
      'Returns only APPROVED and verified listings. Drafts, pending, rejected and suspended listings are excluded at the data layer.',
  })
  async searchListings(
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQueryDto,
  ) {
    return this.search.search(query);
  }

  /**
   * Declared before the `:id` route below. Express matches in declaration
   * order, and although the UUID constraint on `:id` already prevents a
   * collision with the literal "compare", relying on that is fragile — the
   * constraint exists for a different reason and could reasonably be relaxed.
   */
  @Get('listings/compare')
  @ApiOperation({
    summary: 'Compare 2 to 4 listings side by side',
    description:
      'Returns the same structured field set as the detail endpoint, in the order requested. Does not record views — comparing is browsing, not visiting.',
  })
  async compareListings(
    @Query(new ZodValidationPipe(compareQuerySchema)) query: CompareQueryDto,
  ) {
    return this.search.compare(query.ids);
  }

  /**
   * The `:id` param is constrained to a UUID shape.
   *
   * Without it, this route would also match `/api/listings/mine` and
   * `/api/listings/search`, and which handler won would depend on module import
   * order — a seller's dashboard breaking because of a reordered import is not a
   * failure mode worth leaving open.
   */
  @Get('listings/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})')
  @ApiOperation({
    summary: 'Public listing detail',
    description:
      'Includes price per sq ft, the locality median comparison, and price history. Records one deduplicated view per viewer per day.',
  })
  async getListing(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = (req as Request & { user?: AuthenticatedUser }).user;
    return this.search.getPublicListing(id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      // Present only if a valid token happened to be supplied; used solely to
      // avoid counting a seller's views of their own listing.
      userId: user?.id,
    });
  }

  // -------------------------------------------------------------------------
  // New construction
  // -------------------------------------------------------------------------

  /**
   * Declared before the `:id` route below, same reasoning as listings/compare.
   */
  @Get('projects/search')
  @ApiOperation({
    summary: 'Search verified builder projects',
    description:
      'Returns only APPROVED and verified projects. Price and bedroom filters match against the project’s unit configurations, so "3 BHK under ₹1.5 Cr" matches a project offering one.',
  })
  async searchProjects(
    @Query(new ZodValidationPipe(projectSearchSchema)) query: ProjectSearchDto,
  ) {
    return this.projects.search(query);
  }

  @Get('projects/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})')
  @ApiOperation({
    summary: 'Public project detail',
    description:
      'Every configuration with its starting price and remaining inventory. Records one deduplicated view per viewer per day.',
  })
  async getProject(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = (req as Request & { user?: AuthenticatedUser }).user;
    return this.projects.getPublicProject(id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: user?.id,
    });
  }
}
