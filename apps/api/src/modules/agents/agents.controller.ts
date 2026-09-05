import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@kamala/db';
import type { Request } from 'express';

import {
  CurrentUser,
  Public,
  Roles,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AgentsService } from './agents.service';
import {
  agentQueueQuerySchema,
  applyAgentAsUserSchema,
  applyAgentSchema,
  suspendAgentSchema,
  type AgentQueueQueryDto,
  type ApplyAgentAsUserDto,
  type ApplyAgentDto,
  type SuspendAgentDto,
} from './agents.dto';

/**
 * Applications and application-management sit on different auth planes.
 *  - /field-agents/apply is PUBLIC (rate-limited hard) so an applicant can
 *    submit without an existing account — it also creates the account.
 *  - /field-agents/me/apply is authenticated — for a signed-in buyer or
 *    owner who wants to also become an agent.
 *  - /field-agents/me is authenticated — user viewing their own profile.
 *  - Admin routes require MODERATOR or above; activation touches the
 *    User.role column so we do not want any lower privilege reaching it.
 */
const AGENT_ADMIN_ROLES = [Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN] as const;

@ApiTags('field-agents')
@Controller()
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  // -------------------------------------------------------------------------
  // Public application (creates account + agent profile in one step)
  // -------------------------------------------------------------------------

  @Post('field-agents/apply')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({
    summary: 'Submit a field-agent application (anonymous)',
    description:
      'Public endpoint. Creates a User (role = AGENT_APPLICANT) and a FieldAgent (status = PENDING) in one transaction. Returns a session so the applicant lands on their status page already signed in. If the email is already registered, refuse — the signed-in flow at /field-agents/me/apply is the right path.',
  })
  async apply(
    @Body(new ZodValidationPipe(applyAgentSchema)) dto: ApplyAgentDto,
    @Req() req: Request,
    @Ip() ip: string,
  ) {
    const userAgent = req.headers['user-agent'];
    return this.agents.apply(dto, {
      ip,
      userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    });
  }

  @Post('field-agents/me/apply')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit a field-agent application (signed-in)',
    description:
      'Authenticated variant. Links a FieldAgent record to the current user. Existing role (BUYER / OWNER) is preserved through PENDING review; activation upgrades it to FIELD_AGENT.',
  })
  async applyAsUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(applyAgentAsUserSchema)) dto: ApplyAgentAsUserDto,
  ) {
    return this.agents.applyAsUser(user.id, dto);
  }

  // -------------------------------------------------------------------------
  // Public directory (active agents only)
  // -------------------------------------------------------------------------

  @Get('field-agents')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: 'List active field agents',
    description:
      'Public directory. Only ACTIVE agents appear here; no email or phone in the response.',
  })
  async list() {
    return this.agents.listPublic();
  }

  // -------------------------------------------------------------------------
  // Authenticated — see own agent profile if any
  // -------------------------------------------------------------------------

  @Get('field-agents/me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The current user\'s field-agent profile',
    description: 'Returns null if the user has no field-agent record.',
  })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return this.agents.getMine(user.id);
  }

  // -------------------------------------------------------------------------
  // Admin — queue + moderation
  // -------------------------------------------------------------------------

  @Get('admin/field-agents')
  @Roles(...AGENT_ADMIN_ROLES)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Field-agent applications queue',
    description:
      'Filter by status (default: no filter). Sorted oldest-first so the queue is FIFO.',
  })
  async queue(
    @Query(new ZodValidationPipe(agentQueueQuerySchema)) query: AgentQueueQueryDto,
  ) {
    return this.agents.queue(query);
  }

  @Patch('admin/field-agents/:id/activate')
  @Roles(...AGENT_ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Activate a field agent',
    description:
      'Sets FieldAgent.status = ACTIVE AND the linked User.role = FIELD_AGENT in one transaction. Every FieldAgent row has a linked user from creation, so no body is required.',
  })
  async activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.agents.activate(id, user.id);
  }

  @Patch('admin/field-agents/:id/suspend')
  @Roles(...AGENT_ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Suspend an active field agent',
    description:
      'Suspension is reversible via activate. Reason is required and shown on the agent\'s own profile.',
  })
  async suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(suspendAgentSchema)) dto: SuspendAgentDto,
  ) {
    return this.agents.suspend(id, user.id, dto);
  }
}
