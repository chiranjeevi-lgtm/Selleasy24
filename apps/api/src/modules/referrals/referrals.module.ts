import { Module } from '@nestjs/common';

import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({
  controllers: [ReferralsController],
  providers: [ReferralsService],
  // Exported so AuthService (post-signup redemption), VerificationService
  // (seller qualification on listing approval), and LeadsService (buyer
  // qualification on first lead) can inject and trigger without duplicating
  // referral logic across three modules.
  exports: [ReferralsService],
})
export class ReferralsModule {}
