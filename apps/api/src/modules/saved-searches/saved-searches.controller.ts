import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SavedSearchesService } from './saved-searches.service';
import {
  createSavedSearchSchema,
  toggleAlertsSchema,
  type CreateSavedSearchDto,
  type ToggleAlertsDto,
} from './saved-searches.dto';

@ApiTags('saved-searches')
@Controller('saved-searches')
export class SavedSearchesController {
  constructor(private readonly saved: SavedSearchesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Save a search',
    description:
      'Capped at 20 per user. Returns 403 with a specific count when the cap is reached.',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createSavedSearchSchema)) dto: CreateSavedSearchDto,
  ) {
    return this.saved.create(user.id, dto);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my saved searches — newest first' })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return this.saved.listMine(user.id);
  }

  @Patch(':id/alerts')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable or disable alerts on one saved search' })
  async toggle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(toggleAlertsSchema)) dto: ToggleAlertsDto,
  ) {
    return this.saved.toggleAlerts(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a saved search' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.saved.delete(user.id, id);
  }
}
