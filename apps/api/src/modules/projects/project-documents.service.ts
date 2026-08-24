import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DocumentKind, ProjectStatus, Role, type ProjectDocument } from '@kamala/db';
import { randomUUID } from 'node:crypto';

import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { DocumentCryptoService } from '../../common/crypto/document-crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { validateDocument } from '../../common/storage/file-validation';
import type { RequestContext } from '../auth/auth.service';
import type { DocumentContent } from '../listings/documents.service';

/** Same retention window as resale ownership documents. */
const RETENTION_DAYS_AFTER_DECISION = 90;

const DOCUMENT_READER_ROLES: readonly Role[] = [
  Role.VERIFIER,
  Role.MODERATOR,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

/**
 * Statutory project documents.
 *
 * Deliberately a separate service from the resale one rather than a shared
 * generic: the two write to different tables with different ownership columns,
 * and the version that handled both would need a discriminator threaded through
 * every method. The security properties are identical and are stated once here
 * so neither can drift:
 *
 *  - AES-256-GCM before the bytes reach storage, with the storage key bound in
 *    as AAD so ciphertext cannot be moved between documents and still decrypt.
 *  - Private bucket, never CDN-fronted.
 *  - Readable only by verification staff — never by a buyer, and never by
 *    another builder.
 *  - Every read written to DocumentAccessLog before any byte is returned.
 */
@Injectable()
export class ProjectDocumentsService {
  private readonly logger = new Logger(ProjectDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly crypto: DocumentCryptoService,
    private readonly audit: AuditService,
  ) {}

  async upload(
    builderId: string,
    projectId: string,
    kind: DocumentKind,
    file: Express.Multer.File | undefined,
    ctx: RequestContext,
  ): Promise<{ id: string; kind: DocumentKind; filename: string }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, builderId: true, status: true },
    });

    if (!project || project.builderId !== builderId) {
      throw new NotFoundException('Project not found.');
    }

    if (
      project.status !== ProjectStatus.DRAFT &&
      project.status !== ProjectStatus.REJECTED
    ) {
      throw new ForbiddenException(
        'Documents can only be added while a project is in draft or has been rejected.',
      );
    }

    const validated = validateDocument(file);

    // `.enc` because the stored bytes are ciphertext, not a viewable document.
    const key = `projects/${projectId}/documents/${randomUUID()}.enc`;
    const encrypted = this.crypto.encrypt(validated.buffer, key);

    await this.storage.put({
      bucket: 'documents',
      key,
      body: encrypted.ciphertext,
      contentType: 'application/octet-stream',
    });

    const created = await this.prisma.projectDocument.create({
      data: {
        projectId,
        uploadedById: builderId,
        kind,
        storageKey: key,
        encryptionIv: encrypted.iv,
        encryptionTag: encrypted.tag,
        originalFilename: validated.displayFilename,
        // The real type, sniffed from content — not what the client claimed.
        mimeType: validated.mimeType,
        sizeBytes: validated.sizeBytes,
      },
    });

    await this.audit.record({
      actorId: builderId,
      action: AuditAction.DOCUMENT_UPLOADED,
      entityType: 'project_document',
      entityId: created.id,
      metadata: { projectId, kind, mimeType: validated.mimeType },
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return { id: created.id, kind: created.kind, filename: created.originalFilename };
  }

  /**
   * Decrypts a project document for staff review.
   *
   * The access record is written before any byte is returned, so a read cannot
   * happen without a trace of it.
   */
  async readForStaff(
    staffId: string,
    staffRole: Role,
    documentId: string,
    ctx: RequestContext,
  ): Promise<DocumentContent> {
    if (!DOCUMENT_READER_ROLES.includes(staffRole)) {
      throw new ForbiddenException('You do not have permission to view project documents.');
    }

    const document = await this.prisma.projectDocument.findFirst({
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

  async scheduleRetention(projectId: string): Promise<void> {
    const retainUntil = new Date(Date.now() + RETENTION_DAYS_AFTER_DECISION * 86_400_000);

    await this.prisma.projectDocument.updateMany({
      where: { projectId, deletedAt: null, retainUntil: null },
      data: { retainUntil },
    });
  }

  async purgeExpired(): Promise<{ purged: number }> {
    const expired = await this.prisma.projectDocument.findMany({
      where: { deletedAt: null, retainUntil: { lte: new Date() } },
      select: { id: true, storageKey: true },
    });

    let purged = 0;

    for (const document of expired) {
      try {
        await this.storage.delete('documents', document.storageKey);
        await this.prisma.projectDocument.update({
          where: { id: document.id },
          data: { deletedAt: new Date() },
        });
        purged += 1;
      } catch (error) {
        // Left for the next run rather than marked deleted — never claim bytes
        // are gone when they might not be.
        this.logger.error(
          `Failed to purge project document ${document.id}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    if (purged > 0) {
      this.logger.log(`Purged ${purged} expired project document(s)`);
    }

    return { purged };
  }

  private async recordAccess(
    document: ProjectDocument,
    staffId: string,
    ctx: RequestContext,
  ): Promise<void> {
    await this.prisma.documentAccessLog.create({
      data: {
        projectDocumentId: document.id,
        userId: staffId,
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent?.slice(0, 255) ?? null,
      },
    });

    await this.audit.record({
      actorId: staffId,
      action: AuditAction.DOCUMENT_VIEWED,
      entityType: 'project_document',
      entityId: document.id,
      metadata: { projectId: document.projectId, kind: document.kind },
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }
}
