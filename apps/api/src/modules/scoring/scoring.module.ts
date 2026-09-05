import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { RegulatoryModule } from '../regulatory/regulatory.module';
import { ScoringController } from './scoring.controller';
import { ScoringService } from './scoring.service';

/**
 * Depends on AnalyticsModule for locality YoY appreciation and on
 * RegulatoryModule for the RERA-status lookup. Both are imported here so
 * that Nest resolves the dependency graph without every consumer of
 * ScoringService having to import all three.
 */
@Module({
  imports: [AnalyticsModule, RegulatoryModule],
  controllers: [ScoringController],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
