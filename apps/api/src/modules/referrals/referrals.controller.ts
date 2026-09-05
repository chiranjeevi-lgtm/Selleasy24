import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@kamala/db';

import {
  CurrentUser,
  Roles,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ReferralsService } from './referrals.service';
import {
  listRewardsQuerySchema,
  markRewardSchema,
  redeemReferralSchema,
  type ListRewardsQueryDto,
  type MarkRewardDto,
  type RedeemReferralDto,
} from './referrals.dto';

@ApiTags('referrals')
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Post('me/code')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get (or create) my referral code',
    description:
      'Idempotent — same user calling twice returns the same code. Shareable code lives forever.',
  })
  async myCode(@CurrentUser() user: AuthenticatedUser) {
    return this.referrals.getOrCreateCode(user.id);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Referrals I have made + reward totals',
    description:
      'Includes counts by status (pending / qualified / paid) and total rupees earned across all rewards (pending vs paid). Referred user is shown as first name only.',
  })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return this.referrals.listMyReferrals(user.id);
  }

  @Post('redeem')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Redeem a referral code',
    description:
      'One per account. Self-referral is refused with 400; already-redeemed is refused with 409.',
  })
  async redeem(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(redeemReferralSchema)) dto: RedeemReferralDto,
  ) {
    return this.referrals.redeem(user.id, dto);
  }

  // --- Admin ----------------------------------------------------------------

  @Get('rewards')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin — reward payout queue',
    description:
      'Defaults to PENDING rewards. Returns referrer + referred user identity + signup IP so admin can spot sock-puppet farming before paying.',
  })
  async listRewards(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listRewardsQuerySchema)) query: ListRewardsQueryDto,
  ) {
    return this.referrals.listRewards(
      { role: user.role },
      {
        status: query.status,
        ...(query.recipientUserId !== undefined && { recipientUserId: query.recipientUserId }),
        limit: query.limit,
        offset: query.offset,
      },
    );
  }

  @Post('rewards/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin — mark reward paid or voided',
    description:
      'PAID or VOIDED. If both sides of a Referral are PAID, the Referral rolls up to PAID; if either is VOIDED, the Referral goes VOIDED.',
  })
  async resolveReward(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(markRewardSchema)) dto: MarkRewardDto,
  ) {
    return this.referrals.markReward(
      id,
      dto.action,
      dto.paymentNote,
      { id: user.id, role: user.role },
    );
  }
}
