import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DocumentKind, ListingStatus, Role, type Document } from '@kamala/db';
import { randomUUID } from 'node:crypto';

import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { DocumentCryptoService } from '../../common/crypto/document-crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { validateDocument } from '../../common/storage/file-validation';
import type { RequestContext } from '../auth/auth.service';
import type { DocumentUploadDto } from './listings.dto';

/**
 * Retention window after a verification decision.
 *
 * DPDPA data minimisation: the decision and its audit trail are kept
 * permanently, the document itself is not. 90 days covers a dispute or an
 * appeal, after which a sweep deletes the bytes.
 */
const RETENTION_DAYS_AFTER_DECISION = 90;

/** Roles permitted to read an uploaded ownership document. */
const DOCUMENT_READER_ROLES: readonly Role[] = [
  Role.VERIFIER,
  Role.MODERATOR,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

export interface DocumentContent {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Ownership and identity documents.
 *
 * Every path here treats the payload as the most sensitive data on the platform:
 *
 *  - Encrypted with AES-256-GCM by the API before upload, so the storage
 *    provider never holds plaintext.
 *  - Stored in a private bucket that is never CDN-fronted.
 *  - Readable only by verification staff, never by buyers, and never by another
 *    seller.
 *  - Every read is written to DocumentAccessLog — answering "who looked at this
 *    person's ID, and when" is a compliance requirement, not a nice-to-have.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly crypto: DocumentCryptoService,
    private readonly audit: AuditService,
  ) {}

  async upload(
    sellerId: string,
    listingId: string,
    dto: DocumentUploadDto,
    file: Express.Multer.File | undefined,
    ctx: RequestContext,
  ): Promise<{ id: string; kind: DocumentKind; filename: string }> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, sellerId: true, status: true },
    });

    if (!listing || listing.sellerId !== sellerId) {
      throw new NotFoundException('Listing not found.');
    }

    if (
      listing.status !== ListingStatus.DRAFT &&
      listing.status !== ListingStatus.REJECTED
    ) {
      throw new ForbiddenException(
        'Documents can only be added while a listing is in draft or has been rejected.',
      );
    }

    if (dto.kind === DocumentKind.ID_PROOF && !dto.idProofKind) {
      throw new BadRequestException('Specify which kind of identity document this is.');
    }

    const validated = validateDocument(file);

    // Key is a generated UUID with an .enc suffix — the stored bytes are
    // ciphertext, not a viewable document, and the extension should say so.
    const key = `listings/${listingId}/documents/${randomUUID()}.enc`;

    // The storage key is bound in as AAD, so this ciphertext cannot be moved to
    // another document's key and still decrypt.
    const encrypted = this.crypto.encrypt(validated.buffer, key);

    await this.storage.put({
      bucket: 'documents',
      key,
      body: encrypted.ciphertext,
      contentType: 'application/octet-stream',
    });

    const created = await this.prisma.document.create({
      data: {
        listingId,
        uploadedById: sellerId,
        kind: dto.kind,
        idProofKind: dto.idProofKind ?? null,
        storageKey: key,
        encryptionIv: encrypted.iv,
        encryptionTag: encrypted.tag,
        originalFilename: validated.displayFilename,
        // The *real* type, sniffed from content — not what the client claimed.
        mimeType: validated.mimeType,
        sizeBytes: validated.sizeBytes,
      },
    });

    await this.audit.record({
      actorId: sellerId,
      action: AuditAction.DOCUMENT_UPLOADED,
      entityType: 'document',
      entityId: created.id,
      // Records what kind of document, never its contents.
      metadata: { listingId, kind: dto.kind, mimeType: validated.mimeType },
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return { id: created.id, kind: created.kind, filename: created.originalFilename };
  }

  /**
   * Decrypts a document for staff review.
   *
   * Writes an access-log row and an audit entry *before* returning bytes, so a
   * read cannot happen without a record of it. The two writes are separate on
   * purpose: the access log is the fine-grained forensic record, the audit log is
   * the business trail.
   */
  async readForStaff(
    staffId: string,
    staffRole: Role,
    documentId: string,
    ctx: RequestContext,
  ): Promise<DocumentContent> {
    if (!DOCUMENT_READER_ROLES.includes(staffRole)) {
      throw new ForbiddenException('You do not have permission to view listing documents.');
    }

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    await this.recordAccess(document, staffId, ctx);

    const ciphertext = await this.storage.get('documents', document.storageKey);

    const plaintext = this.crypto.decrypt(
      ciphertext,
      document.encryptionIv,
      document.encryptionTag,
      // Same AAD as encryption; a moved or swapped object fails here.
      document.storageKey,
    );

    return {
      buffer: plaintext,
      mimeType: document.mimeType,
      filename: document.originalFilename,
    };
  }

  /**
   * Marks documents for deletion once a decision has been made.
   *
   * Called by the verification module. Sets the retention deadline rather than
   * deleting immediately, so an appeal is still possible.
   */
  async scheduleRetention(listingId: string): Promise<void> {
    const retainUntil = new Date(Date.now() + RETENTION_DAYS_AFTER_DECISION * 86_400_000);

    await this.prisma.document.updateMany({
      where: { listingId, deletedAt: null, retainUntil: null },
      data: { retainUntil },
    });
  }

  /**
   * Deletes documents whose retention window has passed.
   *
   * Intended to run on a schedule. The database row is soft-deleted so the audit
   * trail keeps referencing a real document id, while the bytes are destroyed.
   */
  async purgeExpired(): Promise<{ purged: number }> {
    const expired = await this.prisma.document.findMany({
      where: { deletedAt: null, retainUntil: { lte: new Date() } },
      select: { id: true, storageKey: true },
    });

    let purged = 0;

    for (const document of expired) {
      try {
        await this.storage.delete('documents', document.storageKey);
        await this.prisma.document.update({
          where: { id: document.id },
          data: { deletedAt: new Date() },
        });
        purged += 1;
      } catch (error) {
        // Left for the next run rather than marked deleted — never claim bytes
        // are gone when they might not be.
        this.logger.error(
          `Failed to purge document ${document.id}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    if (purged > 0) {
      this.logger.log(`Purged ${purged} expired document(s)`);
    }

    return { purged };
  }

  private async recordAccess(
    document: Document,
    staffId: string,
    ctx: RequestContext,
  ): Promise<void> {
    await this.prisma.documentAccessLog.create({
      data: {
        documentId: document.id,
        userId: staffId,
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent?.slice(0, 255) ?? null,
      },
    });

    await this.audit.record({
      actorId: staffId,
      action: AuditAction.DOCUMENT_VIEWED,
      entityType: 'document',
      entityId: document.id,
      metadata: { listingId: document.listingId, kind: document.kind },
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }
}
