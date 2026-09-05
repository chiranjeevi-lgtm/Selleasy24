import { Module } from '@nestjs/common';

import { ReferralsModule } from '../referrals/referrals.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  // Buyer-side referral qualification fires on first lead submission by a
  // signed-in buyer.
  imports: [ReferralsModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
