import { Module } from '@nestjs/common';

import { ProjectDocumentsService } from './project-documents.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectDocumentsService],
  // Exported so the verification module can read project documents for review
  // and schedule retention after a decision.
  exports: [ProjectsService, ProjectDocumentsService],
})
export class ProjectsModule {}
