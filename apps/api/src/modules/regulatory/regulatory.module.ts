import { Module } from '@nestjs/common';

import { RegulatoryController } from './regulatory.controller';
import { RegulatoryService } from './regulatory.service';

@Module({
  controllers: [RegulatoryController],
  providers: [RegulatoryService],
  /**
   * Exported so ScoringService can inject and call `.check()` — the RERA
   * status is a scoring input, not just a stand-alone endpoint. Exporting
   * a service is how NestJS modules share behaviour without duplicating
   * the Prisma layer or reintroducing circular deps.
   */
  exports: [RegulatoryService],
})
export class RegulatoryModule {}
