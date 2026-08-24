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
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@kamala/db';
import type { Request } from 'express';

import { CurrentUser, Roles, type AuthenticatedUser } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  DOCUMENT_MAX_BYTES,
  PHOTO_MAX_BYTES,
} from '../../common/storage/file-validation';
import type { RequestContext } from '../auth/auth.service';
import { ProjectDocumentsService } from './project-documents.service';
import {
  createProjectSchema,
  projectDocumentUploadSchema,
  projectPhotoUploadSchema,
  reorderProjectPhotosSchema,
  setUnitsSchema,
  updateProjectSchema,
  type CreateProjectDto,
  type ProjectDocumentUploadDto,
  type ProjectPhotoUploadDto,
  type ReorderProjectPhotosDto,
  type SetUnitsDto,
  type UpdateProjectDto,
} from './projects.dto';
import { ProjectsService } from './projects.service';

/**
 * Builder-facing project management.
 *
 * Restricted to BUILDER throughout. Buyers reach projects through the public
 * search endpoints, and staff through the verification module, which enforces
 * its own roles and writes its own audit entries.
 */
@ApiTags('projects')
@ApiBearerAuth()
@Roles(Role.BUILDER)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly documents: ProjectDocumentsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a draft project' })
  async create(
    @Body(new ZodValidationPipe(createProjectSchema)) dto: CreateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.projects.create(user.id, dto, this.context(req));
  }

  @Get('mine')
  @ApiOperation({
    summary: 'The builder’s own projects, any status',
    description:
      'Includes delivered projects. A builder’s record of handing over past projects is what a buyer judges the current one on, so it is never hidden once inventory runs out.',
  })
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.projects.listMine(user.id);
  }

  @Get('mine/:id')
  @ApiOperation({ summary: 'Full detail of one of the builder’s own projects' })
  async getMine(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.getMine(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a draft or rejected project',
    description:
      'Approved projects cannot be edited — changes after verification would undermine the badge.',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) dto: UpdateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.projects.update(user.id, id, dto, this.context(req));
  }

  // -------------------------------------------------------------------------
  // Units
  // -------------------------------------------------------------------------

  @Put(':id/units')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Replace the project’s unit configurations',
    description:
      'Send the complete set. A per-unit API would need the client to track ids across a form where rows are added and removed freely, and two quick edits race into a state neither side intended.',
  })
  async setUnits(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setUnitsSchema)) dto: SetUnitsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.projects.setUnits(user.id, id, dto.units, this.context(req));
  }

  // -------------------------------------------------------------------------
  // Photos
  // -------------------------------------------------------------------------

  @Post(':id/photos')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a project photo',
    description:
      'Pass isRender=true for an artist’s impression. Buyers read a render and a site photograph very differently, so the distinction is recorded rather than left to a caption.',
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PHOTO_MAX_BYTES, files: 1 } }))
  async addPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(projectPhotoUploadSchema)) dto: ProjectPhotoUploadDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.addPhoto(user.id, id, dto.isRender, file);
  }

  @Patch(':id/photos/order')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the display order of a project’s photos' })
  async reorderPhotos(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reorderProjectPhotosSchema)) dto: ReorderProjectPhotosDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.reorderPhotos(user.id, id, dto.order);
  }

  @Delete(':id/photos/:photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a project photo' })
  async deletePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.projects.deletePhoto(user.id, id, photoId);
  }

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------

  @Post(':id/documents')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a statutory project document',
    description:
      'RERA certificate and sanctioned plan are required before review; an occupancy certificate is required once the project claims to be finished. Encrypted with AES-256-GCM before it reaches storage, and every staff read is logged.',
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 } }))
  async uploadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(projectDocumentUploadSchema)) dto: ProjectDocumentUploadDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.documents.upload(user.id, id, dto.kind, file, this.context(req));
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit for verification',
    description:
      'Requires a verified phone number, at least one unit configuration, 3 photos, the RERA certificate and the sanctioned plan.',
  })
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.projects.submit(user.id, id, this.context(req));
  }

  private context(req: Request): RequestContext {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }
}
