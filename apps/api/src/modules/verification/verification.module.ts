import { Module } from '@nestjs/common';

import { ListingsModule } from '../listings/listings.module';
import { ProjectsModule } from '../projects/projects.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({
  // For DocumentsService and ProjectDocumentsService: reading documents for
  // review and scheduling retention after a decision.
  // ReferralsModule: seller-side referral qualification is triggered when a
  // listing is first approved.
  imports: [ListingsModule, ProjectsModule, ReferralsModule],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
