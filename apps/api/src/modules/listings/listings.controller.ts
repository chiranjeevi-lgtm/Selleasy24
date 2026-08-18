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
import { DocumentsService } from './documents.service';
import {
  createListingSchema,
  documentUploadRefined,
  reorderPhotosSchema,
  updateListingSchema,
  type CreateListingDto,
  type DocumentUploadDto,
  type ReorderPhotosDto,
  type UpdateListingDto,
} from './listings.dto';
import { ListingsService } from './listings.service';

/**
 * Seller-facing listing management.
 *
 * The whole controller is restricted to OWNER and BROKER. Buyers have no listing
 * endpoints at all, and staff read listings through the verification module —
 * which enforces its own roles and writes its own audit entries.
 */
@ApiTags('listings')
@ApiBearerAuth()
@Roles(Role.OWNER, Role.BROKER)
@Controller('listings')
export class ListingsController {
  constructor(
    private readonly listings: ListingsService,
    private readonly documents: DocumentsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a draft listing' })
  async create(
    @Body(new ZodValidationPipe(createListingSchema)) dto: CreateListingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.listings.create(user.id, dto, this.context(req));
  }

  @Get('mine')
  @ApiOperation({
    summary: "The seller's own listings, any status, with view and lead counts",
  })
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.listings.listMine(user.id);
  }

  @Get('mine/:id')
  @ApiOperation({ summary: 'Full detail of one of the seller’s own listings' })
  async getMine(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listings.getMine(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a draft or rejected listing',
    description:
      'Approved listings cannot be edited — changes after verification would undermine the badge.',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateListingSchema)) dto: UpdateListingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.listings.update(user.id, id, dto, this.context(req));
  }

  // -------------------------------------------------------------------------
  // Photos
  // -------------------------------------------------------------------------

  @Post(':id/photos')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a listing photo (3–15 required before submission)' })
  @UseInterceptors(
    FileInterceptor('file', {
      // Memory storage: the buffer is needed for magic-byte sniffing, and photos
      // are small enough that streaming to disk first buys nothing.
      limits: { fileSize: PHOTO_MAX_BYTES, files: 1 },
    }),
  )
  async addPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listings.addPhoto(user.id, id, file);
  }

  @Patch(':id/photos/order')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set the display order of a listing’s photos',
    description:
      'Send every photo id exactly once, in display order. The first is the cover. Allowed on a live listing — reordering changes presentation only, while adding or removing photographs after verification would change what was checked.',
  })
  async reorderPhotos(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reorderPhotosSchema)) dto: ReorderPhotosDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listings.reorderPhotos(user.id, id, dto.order);
  }

  @Delete(':id/photos/:photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a listing photo' })
  async deletePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.listings.deletePhoto(user.id, id, photoId);
  }

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------

  @Post(':id/documents')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload an ownership or identity document',
    description:
      'Encrypted with AES-256-GCM before it reaches storage. Readable only by verification staff, and every read is logged.',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 },
    }),
  )
  async uploadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(documentUploadRefined)) dto: DocumentUploadDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.documents.upload(user.id, id, dto, file, this.context(req));
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit for verification',
    description:
      'Requires a phone number, at least 3 photos, and the sale deed, identity proof and property tax receipt.',
  })
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.listings.submit(user.id, id, this.context(req));
  }

  @Post(':id/confirm-availability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm the property is still available',
    description:
      'Drives the public "owner confirmed N days ago" signal. Deliberately separate from an edit.',
  })
  async confirmAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listings.confirmAvailability(user.id, id);
  }

  private context(req: Request): RequestContext {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }
}
