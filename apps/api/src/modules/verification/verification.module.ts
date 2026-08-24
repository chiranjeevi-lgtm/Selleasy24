import { Module } from '@nestjs/common';

import { ListingsModule } from '../listings/listings.module';
import { ProjectsModule } from '../projects/projects.module';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({
  // For DocumentsService and ProjectDocumentsService: reading documents for
  // review and scheduling retention after a decision.
  imports: [ListingsModule, ProjectsModule],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
