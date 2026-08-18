import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit/audit.service';
import { DocumentCryptoService } from './crypto/document-crypto.service';
import { MailService } from './mail/mail.service';
import { StorageService } from './storage/storage.service';

/**
 * Cross-cutting services with no feature ownership. Global so security
 * primitives are not re-provided (and therefore re-keyed) per module.
 */
@Global()
@Module({
  providers: [AuditService, DocumentCryptoService, MailService, StorageService],
  exports: [AuditService, DocumentCryptoService, MailService, StorageService],
})
export class CommonModule {}
