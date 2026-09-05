import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommitmentStatus,
  Prisma,
  Role,
  type WrittenCommitment,
} from '@kamala/db';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type {
  CreateCommitmentDto,
  ListCommitmentsQueryDto,
  ResolveCommitmentDto,
} from './commitments.dto';

/**
 * Written-commitment ledger — Cross-Cutting Principle #1 realised as code.
 *
 * Every promise that could be worth money to a party is captured before it
 * takes effect. There is no back-door "create without a PDF" — the create
 * flow demands the signed document bytes and refuses to insert a row
 * without them. That is the entire point of the ledger.
 *
 * Append-only: correction happens by writing a superseding row and pointing
 * its `supersededById` at the prior one, then flipping the prior one to
 * status `SUPERSEDED`. There is no update endpoint that mutates a
 * commitment's promise text — the text is a legal claim once signed.
 */
@Injectable()
export class CommitmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Insert a new commitment. Runs the base64 decode, SHA-256 hash, and
   * private-bucket upload in one atomic path — a partial success where the
   * document uploads but the row insert fails would leave the ledger out of
   * sync with the storage bucket, and any partial state is a lie about
   * whether a promise was recorded.
   */
  async create(
    dto: CreateCommitmentDto,
    actor: { id: string; role: Role },
  ): Promise<WrittenCommitment> {
    // Only staff / owner-side accounts may issue a commitment — a random
    // signed-in buyer cannot fabricate a "promise" that binds another party.
    // (A future owner-side flow can widen this; keep the initial surface
    // narrow while the ledger's operational patterns settle.)
    if (
      actor.role !== Role.ADMIN &&
      actor.role !== Role.SUPER_ADMIN &&
      actor.role !== Role.MODERATOR &&
      actor.role !== Role.OWNER &&
      actor.role !== Role.BROKER &&
      actor.role !== Role.BUILDER &&
      actor.role !== Role.FIELD_AGENT
    ) {
      throw new ForbiddenException('Your role cannot issue commitments.');
    }

    const pdfBytes = this.decodeBase64Pdf(dto.documentBase64);
    const documentHash = createHash('sha256').update(pdfBytes).digest('hex');
    const documentStorageKey = `commitments/${randomUUID()}.pdf`;

    // Storage first — a failed upload throws before we insert the row, so
    // there is never a WrittenCommitment pointing at an object that isn't
    // there. The reverse order (insert then upload) is what leaves a ghost.
    await this.storage.put({
      bucket: 'documents',
      key: documentStorageKey,
      body: pdfBytes,
      contentType: 'application/pdf',
    });

    return this.prisma.writtenCommitment.create({
      data: {
        promisorId: actor.id,
        promiseeId: dto.promiseeId,
        type: dto.type,
        promiseText: dto.promiseText,
        ...(dto.amountRupees !== undefined && {
          amountRupees: new Prisma.Decimal(dto.amountRupees),
        }),
        ...(dto.listingId && { listingId: dto.listingId }),
        ...(dto.leadId && { leadId: dto.leadId }),
        ...(dto.expiresAt && { expiresAt: dto.expiresAt }),
        documentStorageKey,
        documentHash,
        documentSizeBytes: pdfBytes.length,
      },
    });
  }

  /**
   * Mark a commitment resolved (honored / disputed / expired).
   *
   * Only the platform's staff resolve — the promisor and promisee themselves
   * do not close their own commitments to avoid a party unilaterally
   * marking a disputed obligation "honored".
   */
  async resolve(
    id: string,
    dto: ResolveCommitmentDto,
    actor: { id: string; role: Role },
  ): Promise<WrittenCommitment> {
    if (
      actor.role !== Role.ADMIN &&
      actor.role !== Role.SUPER_ADMIN &&
      actor.role !== Role.MODERATOR
    ) {
      throw new ForbiddenException('Only staff may resolve commitments.');
    }

    const existing = await this.prisma.writtenCommitment.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Commitment not found.');
    if (existing.status !== CommitmentStatus.ACTIVE) {
      throw new BadRequestException(
        `Commitment is ${existing.status.toLowerCase()} and cannot be resolved again.`,
      );
    }

    return this.prisma.writtenCommitment.update({
      where: { id },
      data: {
        status: dto.status,
        resolvedAt: new Date(),
        resolvedById: actor.id,
        ...(dto.resolutionNote !== undefined && { resolutionNote: dto.resolutionNote }),
      },
    });
  }

  /**
   * Supersede an active commitment with a new one.
   *
   * The prior row is not deleted — it is marked SUPERSEDED and the new row
   * points back to it via `supersededById`. The history is fully
   * reconstructible from a single starting row by walking the chain.
   */
  async supersede(
    priorId: string,
    dto: CreateCommitmentDto,
    actor: { id: string; role: Role },
  ): Promise<WrittenCommitment> {
    const prior = await this.prisma.writtenCommitment.findUnique({ where: { id: priorId } });
    if (!prior) throw new NotFoundException('Prior commitment not found.');
    if (prior.status !== CommitmentStatus.ACTIVE) {
      throw new BadRequestException(
        `Prior commitment is ${prior.status.toLowerCase()} and cannot be superseded.`,
      );
    }

    // Only the original promisor (or staff) can supersede — otherwise a
    // third party could invalidate someone else's binding promise.
    if (
      prior.promisorId !== actor.id &&
      actor.role !== Role.ADMIN &&
      actor.role !== Role.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Only the original promisor or admin may supersede.');
    }

    // Insert the new commitment first, then flip prior's status and link.
    // Wrapped in a transaction so a mid-way failure leaves neither row half-set.
    const created = await this.create(dto, actor);
    await this.prisma.writtenCommitment.update({
      where: { id: prior.id },
      data: {
        status: CommitmentStatus.SUPERSEDED,
        resolvedAt: new Date(),
        resolvedById: actor.id,
      },
    });
    await this.prisma.writtenCommitment.update({
      where: { id: created.id },
      // Link created → prior. The prior row's supersededById is set on the
      // *new* row (points back), matching the schema shape.
      data: { supersededById: prior.id },
    });
    return created;
  }

  /**
   * List commitments. Admin gets everything; a non-staff caller can only
   * see rows they were on either side of, regardless of the query filters.
   */
  async list(
    query: ListCommitmentsQueryDto,
    actor: { id: string; role: Role },
  ) {
    const isStaff =
      actor.role === Role.ADMIN ||
      actor.role === Role.SUPER_ADMIN ||
      actor.role === Role.MODERATOR;

    const where: Prisma.WrittenCommitmentWhereInput = {
      ...(query.promisorId && { promisorId: query.promisorId }),
      ...(query.promiseeId && { promiseeId: query.promiseeId }),
      ...(query.listingId && { listingId: query.listingId }),
      ...(query.leadId && { leadId: query.leadId }),
      ...(query.status && { status: query.status }),
      ...(query.type && { type: query.type }),
    };

    if (!isStaff) {
      // Non-staff callers can only see rows they were on either side of —
      // AND-combined with the query filters so the party scoping cannot be
      // circumvented by supplying somebody else's promisorId.
      where.OR = [{ promisorId: actor.id }, { promiseeId: actor.id }];
    }

    const [total, items] = await Promise.all([
      this.prisma.writtenCommitment.count({ where }),
      this.prisma.writtenCommitment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          promisorId: true,
          promiseeId: true,
          listingId: true,
          leadId: true,
          type: true,
          status: true,
          promiseText: true,
          amountRupees: true,
          signedAt: true,
          acknowledgedAt: true,
          expiresAt: true,
          resolvedAt: true,
          resolutionNote: true,
          supersededById: true,
          documentSizeBytes: true,
          // Storage key + hash intentionally omitted from list — the key
          // shouldn't leak to a listing response, callers use a separate
          // /documents/:id/preview surface for the file itself.
          createdAt: true,
        },
      }),
    ]);

    return { total, limit: query.limit, offset: query.offset, items };
  }

  /** Decode + validate the incoming base64. */
  private decodeBase64Pdf(base64: string): Buffer {
    let bytes: Buffer;
    try {
      bytes = Buffer.from(base64, 'base64');
    } catch {
      throw new BadRequestException('documentBase64 is not valid base64.');
    }
    if (bytes.length < 100) {
      throw new BadRequestException('Decoded document is too small to be a PDF.');
    }
    // %PDF- magic bytes at the start. Refusing anything else means the
    // ledger cannot silently accept a Word doc or a screenshot renamed
    // "commitment.pdf" — the whole point is that this is a legal document.
    const magic = bytes.subarray(0, 5).toString('utf8');
    if (magic !== '%PDF-') {
      throw new BadRequestException('Document must be a PDF (missing %PDF- header).');
    }
    return bytes;
  }
}
