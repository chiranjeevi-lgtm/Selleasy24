import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ReportStatus, Role } from '@kamala/db';
import type { Request } from 'express';

import {
  CurrentUser,
  Public,
  Roles,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { RequestContext } from '../auth/auth.service';
import {
  createLeadSchema,
  createReportSchema,
  resolveReportSchema,
  updateLeadStatusSchema,
  type CreateLeadDto,
  type CreateReportDto,
  type ResolveReportDto,
  type UpdateLeadStatusDto,
} from './leads.dto';
import { LeadsService } from './leads.service';

const MODERATION_ROLES = [Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN] as const;

@ApiTags('leads')
@Controller()
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  // -------------------------------------------------------------------------
  // Buyer — contact owner
  // -------------------------------------------------------------------------

  @Public()
  @Post('listings/:id/enquiries')
  @HttpCode(HttpStatus.CREATED)
  // Tight bucket: this endpoint sends email and is the obvious spam target.
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  @ApiOperation({
    summary: 'Contact the owner of a verified listing',
    description:
      'No account required. The buyer’s phone number is visible only to this listing’s seller, in their dashboard — never emailed, bulk-exported, or shared with other sellers.',
  })
  async createEnquiry(
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body(new ZodValidationPipe(createLeadSchema)) dto: CreateLeadDto,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user?: AuthenticatedUser }).user;
    return this.leads.createLead(listingId, dto, user?.id, this.context(req));
  }

  // -------------------------------------------------------------------------
  // Seller — lead inbox
  // -------------------------------------------------------------------------

  @Get('leads/mine')
  @Roles(Role.OWNER, Role.BROKER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Enquiries on the seller’s own listings',
    description: 'The only place a buyer’s contact details are exposed.',
  })
  async myLeads(@CurrentUser() user: AuthenticatedUser) {
    return this.leads.listLeadsForSeller(user.id);
  }

  @Patch('leads/:id/status')
  @Roles(Role.OWNER, Role.BROKER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Move a lead through the follow-up pipeline' })
  async updateLeadStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLeadStatusSchema)) dto: UpdateLeadStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leads.updateLeadStatus(user.id, id, dto);
  }

  // -------------------------------------------------------------------------
  // Report a listing
  // -------------------------------------------------------------------------

  @Public()
  @Post('listings/:id/reports')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  @ApiOperation({
    summary: 'Report a listing as fake, sold, or incorrect',
    description:
      'Open to anonymous users — requiring an account would suppress the signal we most want. Returns a ticket id the reporter can use to follow up.',
  })
  async report(
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body(new ZodValidationPipe(createReportSchema)) dto: CreateReportDto,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user?: AuthenticatedUser }).user;
    return this.leads.createReport(listingId, dto, user?.id, this.context(req));
  }

  @Public()
  @Get('reports/:id')
  @ApiOperation({
    summary: 'Check the status of a report',
    description:
      'Keyed by the unguessable ticket id. Every incumbent is criticised for complaints that vanish; this is the follow-up path.',
  })
  async reportStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.leads.getReportStatus(id);
  }

  // -------------------------------------------------------------------------
  // Moderation
  // -------------------------------------------------------------------------

  @Get('reports')
  @Roles(...MODERATION_ROLES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Open report queue, oldest first' })
  async reportQueue(@Query('status') status?: ReportStatus) {
    return this.leads.listReports(status);
  }

  @Patch('reports/:id/resolve')
  @Roles(...MODERATION_ROLES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record the outcome of a report' })
  async resolveReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolveReportSchema)) dto: ResolveReportDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.leads.resolveReport(user.id, id, dto, this.context(req));
  }

  private context(req: Request): RequestContext {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }
}
