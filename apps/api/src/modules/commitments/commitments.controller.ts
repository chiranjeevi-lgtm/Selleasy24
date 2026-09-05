import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@kamala/db';

import { CurrentUser, Roles, type AuthenticatedUser } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CommitmentsService } from './commitments.service';
import {
  createCommitmentSchema,
  listCommitmentsQuerySchema,
  resolveCommitmentSchema,
  type CreateCommitmentDto,
  type ListCommitmentsQueryDto,
  type ResolveCommitmentDto,
} from './commitments.dto';

/**
 * Written-commitment endpoints.
 *
 * Every route requires an authenticated session — the ledger has no
 * anonymous surface. Party scoping (a non-staff caller only sees rows they
 * were on either side of) is enforced in the service, not here, because
 * the same rule holds regardless of which endpoint reads the row.
 */
@ApiTags('commitments')
@ApiBearerAuth()
@Controller('commitments')
export class CommitmentsController {
  constructor(private readonly commitments: CommitmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    Role.ADMIN,
    Role.SUPER_ADMIN,
    Role.MODERATOR,
    Role.OWNER,
    Role.BROKER,
    Role.BUILDER,
    Role.FIELD_AGENT,
  )
  @ApiOperation({
    summary: 'Record a new written commitment',
    description:
      'Requires a signed PDF (base64). The document is stored in the private documents bucket and hashed; the row is inserted only after the upload succeeds. There is deliberately no way to record a commitment without a signed document.',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCommitmentSchema)) dto: CreateCommitmentDto,
  ) {
    return this.commitments.create(dto, { id: user.id, role: user.role });
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Resolve an active commitment',
    description:
      'Staff-only. Moves an ACTIVE commitment to HONORED, DISPUTED, or EXPIRED. Terminal — a resolved commitment cannot be re-resolved.',
  })
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(resolveCommitmentSchema)) dto: ResolveCommitmentDto,
  ) {
    return this.commitments.resolve(id, dto, { id: user.id, role: user.role });
  }

  @Post(':id/supersede')
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    Role.ADMIN,
    Role.SUPER_ADMIN,
    Role.OWNER,
    Role.BROKER,
    Role.BUILDER,
    Role.FIELD_AGENT,
  )
  @ApiOperation({
    summary: 'Supersede an active commitment with a new one',
    description:
      'Original promisor or admin only. Writes a new commitment row that points back at the prior, and flips the prior row to SUPERSEDED. The prior row is never deleted — the history walks the chain.',
  })
  supersede(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) priorId: string,
    @Body(new ZodValidationPipe(createCommitmentSchema)) dto: CreateCommitmentDto,
  ) {
    return this.commitments.supersede(priorId, dto, { id: user.id, role: user.role });
  }

  @Get()
  @ApiOperation({
    summary: 'List commitments',
    description:
      'Admin/moderator sees everything. Any other role sees only commitments they were promisor or promisee on. Query filters narrow within the caller\'s visible set — they cannot widen it.',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listCommitmentsQuerySchema)) query: ListCommitmentsQueryDto,
  ) {
    return this.commitments.list(query, { id: user.id, role: user.role });
  }
}
