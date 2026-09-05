import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FieldAgentStatus, Prisma, Role } from '@kamala/db';

import { PasswordService } from '../auth/password.service';
import { TokenService, type TokenPair } from '../auth/token.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  AgentQueueQueryDto,
  ApplyAgentAsUserDto,
  ApplyAgentDto,
  SuspendAgentDto,
} from './agents.dto';

export interface RequestContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  // -------------------------------------------------------------------------
  // Public — application submission (creates User + FieldAgent atomically)
  // -------------------------------------------------------------------------

  /**
   * Anonymous application. Creates a `User` (role = AGENT_APPLICANT) and a
   * `FieldAgent` (status = PENDING) in one transaction, then issues a
   * session so the applicant lands on their status page already signed in.
   *
   * If the email already exists we refuse rather than silently repurposing
   * the account — the signed-in "apply-for-me" endpoint is the correct
   * path for that. Enumeration cost here is the same as auth.register,
   * which makes the same trade for the same reason.
   */
  async apply(
    dto: ApplyAgentDto,
    ctx: RequestContext,
  ): Promise<{
    fieldAgent: { id: string; status: FieldAgentStatus };
    user: { id: string; email: string; fullName: string; role: Role };
    tokens: TokenPair;
  }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists. Sign in and apply from your account instead.',
      );
    }

    // Phone is UNIQUE on User; without this explicit check the collision
    // surfaces as the generic P2002 → "That value is already in use".
    const existingByPhone = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      select: { id: true },
    });
    if (existingByPhone) {
      throw new ConflictException(
        'That phone number is already in use on another account. Sign in with it, or use a different number.',
      );
    }

    const passwordHash = await this.passwords.hash(dto.password);

    const { user, agent } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          fullName: dto.fullName,
          phone: dto.phone,
          passwordHash,
          role: Role.AGENT_APPLICANT,
        },
      });
      const agent = await tx.fieldAgent.create({
        data: {
          userId: user.id,
          fullName: dto.fullName,
          phone: dto.phone,
          email: dto.email,
          experience: dto.experience,
          serviceLocalities: dto.serviceLocalities,
          notes: dto.notes ?? null,
          status: FieldAgentStatus.PENDING,
        },
      });
      return { user, agent };
    });

    const tokens = await this.tokens.issuePair(user, ctx.ip, ctx.userAgent);

    this.logger.log(
      `Field-agent application ${agent.id} received from ${dto.email} (new user ${user.id})`,
    );

    return {
      fieldAgent: { id: agent.id, status: agent.status },
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      tokens,
    };
  }

  /**
   * Application submitted by an already-signed-in user (BUYER / OWNER /
   * etc). Their existing role is preserved through PENDING review;
   * activation upgrades to FIELD_AGENT the same way as the anonymous
   * path. Re-applying updates the pending row (idempotent).
   */
  async applyAsUser(
    userId: string,
    dto: ApplyAgentAsUserDto,
  ): Promise<{ id: string; status: FieldAgentStatus }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Applicants already in the field-agent programme (ACTIVE) refuse; a
    // suspended agent should go through re-activation, not re-application.
    if (user.role === Role.FIELD_AGENT) {
      throw new ConflictException('You are already an active field agent.');
    }

    const existing = await this.prisma.fieldAgent.findUnique({
      where: { userId },
    });

    if (existing) {
      if (existing.status === FieldAgentStatus.ACTIVE) {
        throw new ConflictException('You are already an active field agent.');
      }
      const updated = await this.prisma.fieldAgent.update({
        where: { id: existing.id },
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          experience: dto.experience,
          serviceLocalities: dto.serviceLocalities,
          notes: dto.notes ?? null,
          status: FieldAgentStatus.PENDING,
        },
      });
      return { id: updated.id, status: updated.status };
    }

    const created = await this.prisma.fieldAgent.create({
      data: {
        userId,
        fullName: dto.fullName,
        phone: dto.phone,
        email: user.email,
        experience: dto.experience,
        serviceLocalities: dto.serviceLocalities,
        notes: dto.notes ?? null,
        status: FieldAgentStatus.PENDING,
      },
    });

    this.logger.log(
      `Field-agent application ${created.id} received from user ${userId}`,
    );

    return { id: created.id, status: created.status };
  }

  // -------------------------------------------------------------------------
  // Public — directory (only ACTIVE agents)
  // -------------------------------------------------------------------------

  /**
   * Public agent directory. Only returns ACTIVE agents. Fields exposed:
   * name, service localities, rating aggregate. Never email or phone —
   * contact happens via the platform once assistance requests exist.
   */
  async listPublic(limit = 50) {
    const rows = await this.prisma.fieldAgent.findMany({
      where: { status: FieldAgentStatus.ACTIVE },
      select: {
        id: true,
        fullName: true,
        serviceLocalities: true,
        ratingAverage: true,
        ratingCount: true,
        completedAssignments: true,
        activatedAt: true,
      },
      orderBy: [
        { ratingAverage: 'desc' },
        { completedAssignments: 'desc' },
      ],
      take: limit,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        serviceLocalities: r.serviceLocalities,
        ratingAverage: r.ratingAverage === null ? null : Number(r.ratingAverage),
        ratingCount: r.ratingCount,
        completedAssignments: r.completedAssignments,
        activatedAt: r.activatedAt?.toISOString() ?? null,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Authenticated user — see own profile
  // -------------------------------------------------------------------------

  async getMine(userId: string) {
    const record = await this.prisma.fieldAgent.findUnique({
      where: { userId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        experience: true,
        serviceLocalities: true,
        status: true,
        activatedAt: true,
        suspendedAt: true,
        suspendedReason: true,
        ratingAverage: true,
        ratingCount: true,
        completedAssignments: true,
        createdAt: true,
      },
    });
    if (!record) return null;
    return {
      ...record,
      ratingAverage:
        record.ratingAverage === null ? null : Number(record.ratingAverage),
      activatedAt: record.activatedAt?.toISOString() ?? null,
      suspendedAt: record.suspendedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Admin — queue + activate + suspend
  // -------------------------------------------------------------------------

  async queue(query: AgentQueueQueryDto) {
    const where: Prisma.FieldAgentWhereInput = {};
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.fieldAgent.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.fieldAgent.count({ where }),
    ]);

    return {
      total,
      limit: query.limit,
      offset: query.offset,
      items: items.map((a) => ({
        id: a.id,
        userId: a.userId,
        fullName: a.fullName,
        phone: a.phone,
        email: a.email,
        experience: a.experience,
        serviceLocalities: a.serviceLocalities,
        notes: a.notes,
        status: a.status,
        activatedAt: a.activatedAt?.toISOString() ?? null,
        suspendedAt: a.suspendedAt?.toISOString() ?? null,
        suspendedReason: a.suspendedReason,
        ratingAverage: a.ratingAverage === null ? null : Number(a.ratingAverage),
        ratingCount: a.ratingCount,
        completedAssignments: a.completedAssignments,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Activate a pending / suspended field agent. Two things happen in one
   * transaction: FieldAgent.status → ACTIVE, User.role → FIELD_AGENT.
   *
   * Every record has a linked user from creation, so activation takes no
   * body — just click Activate. A legacy record from the old schema with
   * userId = NULL is refused with a specific error message; those must be
   * deleted directly in the DB (rare, dev-only leftovers).
   */
  async activate(
    agentId: string,
    adminId: string,
  ): Promise<{ id: string; status: FieldAgentStatus }> {
    const agent = await this.prisma.fieldAgent.findUnique({
      where: { id: agentId },
    });
    if (!agent) throw new NotFoundException('Field agent not found');
    if (agent.status === FieldAgentStatus.ACTIVE) {
      throw new BadRequestException('Field agent is already active');
    }
    if (!agent.userId) {
      throw new BadRequestException(
        'Legacy record with no linked user — delete and ask the applicant to re-apply through the current form.',
      );
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.fieldAgent.update({
        where: { id: agentId },
        data: {
          status: FieldAgentStatus.ACTIVE,
          activatedAt: new Date(),
          activatedById: adminId,
          suspendedAt: null,
          suspendedById: null,
          suspendedReason: null,
        },
      }),
      this.prisma.user.update({
        where: { id: agent.userId },
        data: { role: Role.FIELD_AGENT },
      }),
    ]);

    this.logger.log(
      `Field agent ${agentId} activated by admin ${adminId} (user ${agent.userId})`,
    );
    return { id: updated.id, status: updated.status };
  }

  async suspend(
    agentId: string,
    adminId: string,
    dto: SuspendAgentDto,
  ): Promise<{ id: string; status: FieldAgentStatus }> {
    const agent = await this.prisma.fieldAgent.findUnique({
      where: { id: agentId },
    });
    if (!agent) throw new NotFoundException('Field agent not found');
    if (agent.status === FieldAgentStatus.SUSPENDED) {
      throw new BadRequestException('Field agent is already suspended');
    }

    const updated = await this.prisma.fieldAgent.update({
      where: { id: agentId },
      data: {
        status: FieldAgentStatus.SUSPENDED,
        suspendedAt: new Date(),
        suspendedById: adminId,
        suspendedReason: dto.reason,
      },
    });

    this.logger.log(
      `Field agent ${agentId} suspended by admin ${adminId}: ${dto.reason}`,
    );
    return { id: updated.id, status: updated.status };
  }
}
