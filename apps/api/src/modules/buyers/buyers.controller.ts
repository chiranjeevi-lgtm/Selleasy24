import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentUser, type AuthenticatedUser } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  aboutStepSchema,
  budgetStepSchema,
  localitiesStepSchema,
  purposeStepSchema,
  type AboutStepDto,
  type BudgetStepDto,
  type LocalitiesStepDto,
  type PurposeStepDto,
} from './buyers.dto';
import { BuyersService } from './buyers.service';

const recommendationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).default(12),
});

type RecommendationsQueryDto = z.infer<typeof recommendationsQuerySchema>;

/**
 * A buyer's own preferences.
 *
 * No `@Roles()`: any signed-in account may hold preferences, including a seller
 * who is also looking to buy. The endpoints are scoped to `user.id` throughout,
 * so an account can only ever read or write its own.
 *
 * One endpoint per step rather than one PATCH. Each step is saved as the buyer
 * completes it, so abandoning halfway keeps what they already answered — which
 * is the entire reason the flow is split up.
 */
@ApiTags('buyers')
@ApiBearerAuth()
@Controller('buyers/me')
export class BuyersController {
  constructor(private readonly buyers: BuyersService) {}

  @Get('profile')
  @ApiOperation({
    summary: 'The buyer’s own preferences',
    description: 'Created empty on first read, so there is no separate setup call.',
  })
  async profile(@CurrentUser() user: AuthenticatedUser) {
    return this.buyers.getProfile(user.id);
  }

  @Put('profile/purpose')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 1 — why they are buying, and for how many people' })
  async savePurpose(
    @Body(new ZodValidationPipe(purposeStepSchema)) dto: PurposeStepDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.buyers.savePurpose(user.id, dto);
  }

  @Put('profile/budget')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Step 2 — budget, and optionally monthly income',
    description:
      'Income is optional and is never shown to a seller. It affects only what we say a bank is likely to lend, not which properties are ranked.',
  })
  async saveBudget(
    @Body(new ZodValidationPipe(budgetStepSchema)) dto: BudgetStepDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.buyers.saveBudget(user.id, dto);
  }

  @Put('profile/localities')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 3 — preferred areas; send the complete set' })
  async saveLocalities(
    @Body(new ZodValidationPipe(localitiesStepSchema)) dto: LocalitiesStepDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.buyers.saveLocalities(user.id, dto);
  }

  @Put('profile/about')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 4 — occupation, and marks the run finished' })
  async saveAbout(
    @Body(new ZodValidationPipe(aboutStepSchema)) dto: AboutStepDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.buyers.saveAbout(user.id, dto);
  }

  @Post('profile/skip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'End the run without answering the rest',
    description:
      'Keeps whatever was already answered. A buyer who cannot reach a property listing quickly leaves, so every step is skippable.',
  })
  async skip(@CurrentUser() user: AuthenticatedUser) {
    return this.buyers.skipRemaining(user.id);
  }

  @Get('recommendations')
  @ApiOperation({
    summary: 'Listings ranked against the buyer’s stated preferences',
    description:
      'Each result carries the reasons it was chosen. Returns an empty list when we know nothing about the buyer rather than falling back to arbitrary listings — labelling those "recommended" would be a claim we cannot support.',
  })
  async recommendations(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(recommendationsQuerySchema)) query: RecommendationsQueryDto,
  ) {
    return this.buyers.recommendations(user.id, query.limit);
  }
}
