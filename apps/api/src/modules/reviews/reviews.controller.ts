import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
  createLocalityReviewSchema,
  moderateLocalityReviewSchema,
  reviewListQuerySchema,
  updateLocalityReviewSchema,
  type CreateLocalityReviewDto,
  type ModerateLocalityReviewDto,
  type ReviewListQueryDto,
  type UpdateLocalityReviewDto,
} from './reviews.dto';
import { ReviewsService } from './reviews.service';

const MODERATION_ROLES = [Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN] as const;

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  // -------------------------------------------------------------------------
  // Author actions — any signed-in user
  // -------------------------------------------------------------------------

  /**
   * Submit a review for a locality.
   *
   * Requires a session. The database's unique(authorId, neighborhoodId)
   * constraint enforces one review per user per locality — a second POST
   * from the same account converts to 409, prompting the frontend to route
   * the user into the edit flow instead.
   *
   * Throttled tighter than the global limit because a spam vector on a
   * moderation queue is one abusive account posting one review per second
   * across every locality.
   */
  @Post('localities/:id/reviews')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a locality review; enters the moderation queue' })
  async create(
    @Param('id', ParseUUIDPipe) neighborhoodId: string,
    @Body(new ZodValidationPipe(createLocalityReviewSchema)) dto: CreateLocalityReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.create(user.id, neighborhoodId, dto);
  }

  /**
   * Edit your own review.
   *
   * Substantive edits (rating jump ≥ 2, or ≥ 30% of pros/cons text changed)
   * reset the review to PENDING. Small edits keep the approved status. That
   * policy is enforced in the service.
   */
  @Put('reviews/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit your own review' })
  async update(
    @Param('id', ParseUUIDPipe) reviewId: string,
    @Body(new ZodValidationPipe(updateLocalityReviewSchema)) dto: UpdateLocalityReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.update(user.id, reviewId, dto);
  }

  @Delete('reviews/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete your own review' })
  async remove(
    @Param('id', ParseUUIDPipe) reviewId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.reviews.deleteOwn(user.id, reviewId);
  }

  /**
   * Fetch the caller's own review for a given locality — nullable.
   *
   * Used by the frontend to decide whether to render an "add review" form
   * or a pre-filled edit form. Distinct from the public list because it
   * returns pending/rejected reviews too — the author needs to see their
   * own moderation state.
   */
  @Get('localities/:id/reviews/mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Your review for this locality, if any' })
  async mine(
    @Param('id', ParseUUIDPipe) neighborhoodId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.myReview(user.id, neighborhoodId);
  }

  // -------------------------------------------------------------------------
  // Public reads
  // -------------------------------------------------------------------------

  /**
   * Public locality reviews — APPROVED only, paginated. Author is exposed
   * as first name only.
   */
  @Get('localities/:id/reviews')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Public list of approved reviews for a locality' })
  async list(
    @Param('id', ParseUUIDPipe) neighborhoodId: string,
    @Query(new ZodValidationPipe(reviewListQuerySchema)) query: ReviewListQueryDto,
  ) {
    return this.reviews.listPublic(neighborhoodId, query);
  }

  // -------------------------------------------------------------------------
  // Moderation
  // -------------------------------------------------------------------------

  @Get('reviews/moderation-queue')
  @Roles(...MODERATION_ROLES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Moderation queue — defaults to PENDING, oldest first' })
  async queue(
    @Query(new ZodValidationPipe(reviewListQuerySchema)) query: ReviewListQueryDto,
  ) {
    return this.reviews.moderationQueue(query);
  }

  @Patch('reviews/:id/moderate')
  @Roles(...MODERATION_ROLES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve or reject a review' })
  async moderate(
    @Param('id', ParseUUIDPipe) reviewId: string,
    @Body(new ZodValidationPipe(moderateLocalityReviewSchema))
    dto: ModerateLocalityReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.moderate(user.id, reviewId, dto);
  }
}
