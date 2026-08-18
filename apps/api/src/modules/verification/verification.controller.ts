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
  decideSchema,
  queueQuerySchema,
  type DecideDto,
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

  private context(req: Request): RequestContext {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }
}
