import { Module } from '@nestjs/common';

import { DocumentsService } from './documents.service';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

@Module({
  controllers: [ListingsController],
  providers: [ListingsService, DocumentsService],
  // DocumentsService is exported so the verification module can read documents
  // for review and schedule retention after a decision.
  exports: [ListingsService, DocumentsService],
})
export class ListingsModule {}
