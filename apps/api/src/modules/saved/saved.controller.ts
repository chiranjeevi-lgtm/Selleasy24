import { Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, type AuthenticatedUser } from '../../common/auth/auth.decorators';
import { SavedService } from './saved.service';

/**
 * Saved properties.
 *
 * Every route requires a session — the global JwtAuthGuard applies because
 * nothing here is marked `@Public()`. That is the deliberate difference from
 * comparison, which works signed-out: a shortlist has to be attached to an
 * account to survive across devices, which is what the PRD asks for.
 *
 * No `@Roles()`: any signed-in account can shortlist, including a seller
 * browsing other people's homes.
 */
@ApiTags('saved')
@ApiBearerAuth()
@Controller()
export class SavedController {
  constructor(private readonly saved: SavedService) {}

  @Get('saved')
  @ApiOperation({
    summary: 'The signed-in buyer’s shortlist',
    description:
      'Newest first. Includes homes that are no longer available, flagged with a reason, so a buyer is told their shortlisted home has gone rather than finding it silently missing.',
  })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.saved.list(user.id);
  }

  @Get('saved/ids')
  @ApiOperation({
    summary: 'Saved listing ids',
    description:
      'Just the ids, so a results page can render every save toggle in the right state with one request instead of one per card.',
  })
  async ids(@CurrentUser() user: AuthenticatedUser) {
    return { ids: await this.saved.savedIds(user.id) };
  }

  @Post('listings/:id/save')
  @ApiOperation({
    summary: 'Save a listing',
    description: 'Idempotent — saving an already-saved listing succeeds.',
  })
  async save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) listingId: string,
  ) {
    return this.saved.save(user.id, listingId);
  }

  @Delete('listings/:id/save')
  @ApiOperation({
    summary: 'Remove a listing from the shortlist',
    description: 'Idempotent — removing something not saved succeeds.',
  })
  async unsave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) listingId: string,
  ) {
    return this.saved.unsave(user.id, listingId);
  }
}
