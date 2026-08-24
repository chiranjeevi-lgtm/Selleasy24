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
  createProjectLeadSchema,
  createSiteVisitSchema,
  respondSiteVisitSchema,
  createReportSchema,
  resolveReportSchema,
  updateLeadStatusSchema,
  type CreateLeadDto,
  type CreateProjectLeadDto,
  type CreateSiteVisitDto,
  type RespondSiteVisitDto,
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

  /**
   * Requires a session.
   *
   * Previously open to anyone. Changed so sellers receive enquiries from
   * accounts rather than from unverified strangers — on a platform whose whole
   * proposition is that both sides have been checked, an anonymous enquiry was
   * the weakest link. Reporting a listing stays open, because requiring an
   * account there would suppress the fraud signal we most want.
   */
  @Post('listings/:id/enquiries')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  // Tight bucket: this endpoint sends email and is the obvious spam target.
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  @ApiOperation({
    summary: 'Contact the owner of a verified listing',
    description:
      'Requires a signed-in buyer. Their phone number is visible only to this listing’s seller, in their dashboard — never emailed, bulk-exported, or shared with other sellers.',
  })
  async createEnquiry(
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body(new ZodValidationPipe(createLeadSchema)) dto: CreateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.leads.createLead(listingId, dto, user.id, this.context(req));
  }

  // -------------------------------------------------------------------------
  // Site visits
  // -------------------------------------------------------------------------

  @Post('listings/:id/site-visits')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  @ApiOperation({
    summary: 'Ask to visit a property',
    description:
      'Requires a signed-in buyer. One open request per buyer per listing, so a seller’s inbox does not fill with the same person asking twice.',
  })
  async createSiteVisit(
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body(new ZodValidationPipe(createSiteVisitSchema)) dto: CreateSiteVisitDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.leads.createSiteVisit(listingId, dto, user.id, this.context(req));
  }

  @Get('site-visits/mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The buyer’s own visit requests and their status' })
  async mySiteVisits(@CurrentUser() user: AuthenticatedUser) {
    return this.leads.listSiteVisitsForBuyer(user.id);
  }

  @Get('site-visits/received')
  @Roles(Role.OWNER, Role.BROKER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Visit requests on the seller’s own listings' })
  async receivedSiteVisits(@CurrentUser() user: AuthenticatedUser) {
    return this.leads.listSiteVisitsForSeller(user.id);
  }

  @Patch('site-visits/:id/respond')
  @Roles(Role.OWNER, Role.BROKER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm, reschedule or decline a visit request',
    description: 'Declining requires a reason — a request going quiet is the complaint buyers make most about the incumbents.',
  })
  async respondToSiteVisit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(respondSiteVisitSchema)) dto: RespondSiteVisitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leads.respondToSiteVisit(user.id, id, dto);
  }

  /**
   * Contacting a builder about a project.
   *
   * Mirrors the listing enquiry above in every respect that matters: an account
   * is required, and the builder is told who got in touch without their number
   * being put in an email.
   */
  @Post('projects/:id/enquiries')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  // Same tight bucket as listing enquiries — it sends email and is the obvious
  // spam target.
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  @ApiOperation({
    summary: 'Contact the builder of a verified project',
    description:
      'Requires a signed-in buyer, and optionally names the configuration they are asking about. Their phone number is visible only to this builder, in their dashboard — never emailed, bulk-exported, or shared.',
  })
  async createProjectEnquiry(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(createProjectLeadSchema)) dto: CreateProjectLeadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.leads.createProjectLead(projectId, dto, user.id, this.context(req));
  }

  // -------------------------------------------------------------------------
  // Seller and builder — one enquiry inbox
  // -------------------------------------------------------------------------

  @Get('leads/mine')
  @Roles(Role.OWNER, Role.BROKER, Role.BUILDER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Enquiries on the caller’s own listings and projects',
    description:
      'One inbox for both. A builder holding resale stock as well as a project should not have to look in two places to find out who is trying to reach them. The only place a buyer’s contact details are exposed.',
  })
  async myLeads(@CurrentUser() user: AuthenticatedUser) {
    return this.leads.listLeadsForSeller(user.id);
  }

  @Patch('leads/:id/status')
  @Roles(Role.OWNER, Role.BROKER, Role.BUILDER)
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
