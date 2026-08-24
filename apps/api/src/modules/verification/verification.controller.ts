import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@kamala/db';
import type { Request, Response } from 'express';

import { CurrentUser, Public, Roles, type AuthenticatedUser } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { RequestContext } from '../auth/auth.service';
import {
  decideProjectSchema,
  decideSchema,
  queueQuerySchema,
  type DecideDto,
  type DecideProjectDto,
  type QueueQueryDto,
} from './verification.dto';
import { VerificationService } from './verification.service';

/** Staff roles permitted to work the verification queue. */
const REVIEW_ROLES = [Role.VERIFIER, Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN] as const;

@ApiTags('verification')
@Controller('verification')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  // -------------------------------------------------------------------------
  // Public — the badge detail
  // -------------------------------------------------------------------------

  /**
   * Deliberately public and unauthenticated.
   *
   * The verification checklist is the product. Putting it behind a login (or a
   * phone number, as incumbents do with RERA data) would defeat the point.
   */
  @Public()
  @Get('public/:listingId')
  @ApiOperation({
    summary: 'Verification checklist for an approved listing — public, no login required',
  })
  async publicVerification(@Param('listingId', ParseUUIDPipe) listingId: string) {
    return this.verification.publicVerification(listingId);
  }

  @Public()
  @Get('projects/public/:projectId')
  @ApiOperation({
    summary: 'Verification checklist for an approved project — public, no login required',
  })
  async publicProjectVerification(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.verification.publicProjectVerification(projectId);
  }

  // -------------------------------------------------------------------------
  // Staff — queue and review
  // -------------------------------------------------------------------------

  @Get('queue')
  @Roles(...REVIEW_ROLES)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Pending verification queue, oldest first, with SLA ageing',
  })
  async queue(@Query(new ZodValidationPipe(queueQuerySchema)) query: QueueQueryDto) {
    return this.verification.queue(query);
  }

  @Get('listings/:id')
  @Roles(...REVIEW_ROLES)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Full listing detail for review',
    description: 'Returns document metadata only. Bytes are fetched per document, and each fetch is logged.',
  })
  async getForReview(@Param('id', ParseUUIDPipe) id: string) {
    return this.verification.getForReview(id);
  }

  /**
   * Streams a decrypted document.
   *
   * Not a presigned URL: documents are encrypted at the application layer, so a
   * presigned URL would hand back ciphertext. Streaming through the API means
   * every byte passes an authorisation check and is written to
   * DocumentAccessLog.
   */
  @Get('documents/:documentId')
  @Roles(...REVIEW_ROLES)
  @ApiBearerAuth()
  // Never cached anywhere. A cached identity document is a leak waiting to happen.
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  // Sandboxed so that even if a malicious payload survived upload validation, it
  // cannot execute script or navigate in the viewer's context.
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @ApiOperation({ summary: 'Decrypt and stream a document for review (access is logged)' })
  async readDocument(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const document = await this.verification.readDocument(
      user.id,
      user.role,
      documentId,
      this.context(req),
    );

    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Length', document.buffer.byteLength);
    // Filename is quoted and already sanitised at upload; `inline` so reviewers
    // can preview without downloading.
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${document.filename.replace(/"/g, '')}"`,
    );

    return new StreamableFile(document.buffer);
  }

  // -------------------------------------------------------------------------
  // Staff — decision
  // -------------------------------------------------------------------------

  @Post('listings/:id/decide')
  @Roles(...REVIEW_ROLES)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve, reject, or request a revision',
    description:
      'Approval requires all four mandatory checks recorded and passing. Rejection and revision require a reason, which is emailed to the seller. Every decision writes an audit entry in the same transaction.',
  })
  async decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideSchema)) dto: DecideDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.verification.decide(user.id, id, dto, this.context(req));
  }

  // -------------------------------------------------------------------------
  // Staff — builder projects
  // -------------------------------------------------------------------------

  /**
   * Declared before `projects/:id`, which would otherwise match "queue" and try
   * to load a project with that id.
   */
  @Get('projects/queue')
  @Roles(...REVIEW_ROLES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pending project queue, oldest first, with SLA ageing' })
  async projectQueue(@Query(new ZodValidationPipe(queueQuerySchema)) query: QueueQueryDto) {
    return this.verification.projectQueue(query);
  }

  @Get('projects/:id')
  @Roles(...REVIEW_ROLES)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Full project detail for review',
    description:
      'Returns document metadata only, plus the checks this project’s stage requires. Bytes are fetched per document, and each fetch is logged.',
  })
  async getProjectForReview(@Param('id', ParseUUIDPipe) id: string) {
    return this.verification.getProjectForReview(id);
  }

  @Get('project-documents/:documentId')
  @Roles(...REVIEW_ROLES)
  @ApiBearerAuth()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @ApiOperation({ summary: 'Decrypt and stream a project document (access is logged)' })
  async readProjectDocument(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const document = await this.verification.readProjectDocument(
      user.id,
      user.role,
      documentId,
      this.context(req),
    );

    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Length', document.buffer.byteLength);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${document.filename.replace(/"/g, '')}"`,
    );

    return new StreamableFile(document.buffer);
  }

  @Post('projects/:id/decide')
  @Roles(...REVIEW_ROLES)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve, reject, or request a revision on a project',
    description:
      'Which checks are mandatory depends on the project’s stage — an occupancy certificate is required once it claims to be finished, and would be impossible for a pre-launch project. Rejection and revision require a reason, which is emailed to the builder.',
  })
  async decideProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideProjectSchema)) dto: DecideProjectDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.verification.decideProject(user.id, id, dto, this.context(req));
  }

  private context(req: Request): RequestContext {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }
}
