import { Module } from '@nestjs/common';

import { ProjectsSearchService } from './projects-search.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, ProjectsSearchService],
  exports: [SearchService, ProjectsSearchService],
})
export class SearchModule {}
