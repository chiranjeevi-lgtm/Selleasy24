import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@kamala/db';
import { PrismaService } from '../prisma/prisma.service';

/** Machine-readable action verbs. Kept as a closed set so queries stay reliable. */
export const AuditAction = {
  // Auth
  USER_REGISTERED: 'user.registered',
  USER_LOGGED_IN: 'user.logged_in',
  USER_LOGIN_FAILED: 'user.login_failed',
  USER_LOCKED_OUT: 'user.locked_out',
  USER_LOGGED_OUT: 'user.logged_out',
  USER_EMAIL_VERIFIED: 'user.email_verified',
  USER_PASSWORD_RESET_REQUESTED: 'user.password_reset_requested',
  USER_PASSWORD_RESET: 'user.password_reset',
  USER_TOKEN_REUSE_DETECTED: 'user.token_reuse_detected',

  // Listings
  LISTING_CREATED: 'listing.created',
  LISTING_SUBMITTED: 'listing.submitted',
  LISTING_APPROVED: 'listing.approved',
  LISTING_REJECTED: 'listing.rejected',
  LISTING_REVISION_REQUESTED: 'listing.revision_requested',
  LISTING_PRICE_CHANGED: 'listing.price_changed',
  LISTING_PAUSED: 'listing.paused',
  LISTING_RESUMED: 'listing.resumed',
  LISTING_SOLD: 'listing.sold',

  // Builder projects
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_SUBMITTED: 'project.submitted',
  PROJECT_APPROVED: 'project.approved',
  PROJECT_REJECTED: 'project.rejected',
  PROJECT_REVISION_REQUESTED: 'project.revision_requested',

  // Documents — every read is recorded, not just decisions
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_VIEWED: 'document.viewed',

  // Leads
  LEAD_CREATED: 'lead.created',
  LEAD_STATUS_CHANGED: 'lead.status_changed',

  // Moderation
  REPORT_FILED: 'report.filed',
  REPORT_RESOLVED: 'report.resolved',
  USER_SUSPENDED: 'user.suspended',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  /** Null for system-initiated or pre-authentication events. */
  actorId?: string | null;
  action: AuditActionValue;
  entityType: string;
  entityId: string;
  /** Must contain no credentials, document contents, or full PII. */
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only business audit trail.
 *
 * Distinct from application logging: this is a compliance record, retained
 * independently of log retention, with no update or delete path anywhere in the
 * codebase.
 *
 * Failures are logged but never thrown. An audit write must not roll back the
 * business action that succeeded — losing one audit row is bad, but failing a
 * verifier's approval because of it is worse. If an action must be provably
 * audited, write it inside the same transaction as the action instead (see
 * {@link recordInTransaction}).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: this.toData(entry) });
    } catch (error) {
      this.logger.error(
        `Failed to write audit entry ${entry.action} for ${entry.entityType}:${entry.entityId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Writes inside a caller-supplied transaction, so the audit row and the action
   * commit or fail together. Use for verification decisions, where an unaudited
   * approval is not acceptable.
   */
  async recordInTransaction(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: this.toData(entry) });
  }

  private toData(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
    return {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata ?? undefined,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent?.slice(0, 255) ?? null,
    };
  }
}
