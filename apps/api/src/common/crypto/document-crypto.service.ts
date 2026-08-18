import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Env } from '../../config/env.schema';

const ALGORITHM = 'aes-256-gcm';
/** 96 bits — the size GCM is specified for and the only length that keeps its security proof. */
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export interface EncryptedPayload {
  ciphertext: Buffer;
  /** Base64. Stored alongside the object; not secret. */
  iv: string;
  /** Base64 GCM authentication tag. Tampering is detected on decrypt. */
  tag: string;
}

/**
 * Application-layer encryption for ownership documents and identity proofs.
 *
 * Why this exists rather than relying on the provider's server-side encryption:
 *
 *  1. The storage provider never holds plaintext, so a bucket misconfiguration
 *     or provider-side compromise does not expose a single sale deed or ID.
 *  2. It is provider-agnostic — the same guarantee holds on Spaces, R2 or S3,
 *     so the hosting decision stays reversible.
 *  3. It is strictly stronger than SSE-KMS, where the provider does hold the
 *     plaintext at rest momentarily and holds the key material throughout.
 *
 * The key lives only in the secrets manager and is validated as exactly 32 bytes
 * at boot (see config/env.schema.ts). Rotating it requires re-encrypting every
 * stored document — see docs/DEPLOYMENT.md before changing it in a live
 * environment.
 */
@Injectable()
export class DocumentCryptoService {
  private readonly logger = new Logger(DocumentCryptoService.name);
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.key = Buffer.from(this.config.getOrThrow<string>('DOCUMENT_ENCRYPTION_KEY'), 'base64');

    // Defence in depth: env validation already enforces this, but a wrong key
    // length here would silently weaken every document on the platform.
    if (this.key.length !== 32) {
      throw new Error(
        `DOCUMENT_ENCRYPTION_KEY must decode to 32 bytes for AES-256, got ${this.key.length}`,
      );
    }
  }

  /**
   * Encrypts a document buffer.
   *
   * `storageKey` is bound in as Additional Authenticated Data. This means the
   * ciphertext is cryptographically tied to its object location: an attacker
   * with write access to the bucket cannot swap document A's bytes into
   * document B's slot, because decryption of the moved object will fail its
   * auth-tag check rather than silently returning the wrong person's deed.
   */
  encrypt(plaintext: Buffer, storageKey: string): EncryptedPayload {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });

    cipher.setAAD(Buffer.from(storageKey, 'utf8'));

    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    return {
      ciphertext,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }

  /**
   * Decrypts a document, verifying integrity.
   *
   * Throws on any tampering, truncation, wrong key, or a ciphertext moved to a
   * different storage key. Callers must treat a throw as "this document is not
   * trustworthy" and never fall back to returning raw bytes.
   */
  decrypt(ciphertext: Buffer, iv: string, tag: string, storageKey: string): Buffer {
    const ivBuffer = Buffer.from(iv, 'base64');
    const tagBuffer = Buffer.from(tag, 'base64');

    if (ivBuffer.length !== IV_BYTES) {
      throw new InternalServerErrorException('Stored document has an invalid IV.');
    }
    if (tagBuffer.length !== AUTH_TAG_BYTES) {
      throw new InternalServerErrorException('Stored document has an invalid authentication tag.');
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, ivBuffer, {
        authTagLength: AUTH_TAG_BYTES,
      });
      decipher.setAAD(Buffer.from(storageKey, 'utf8'));
      decipher.setAuthTag(tagBuffer);

      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (error) {
      // Logged without the ciphertext or key. A failure here is either
      // corruption or tampering; both warrant investigation.
      this.logger.error(
        `Document decryption failed for storageKey=${storageKey}. Possible tampering or key mismatch.`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Document could not be decrypted.');
    }
  }

  /**
   * Constant-time comparison for hashed tokens.
   *
   * Lives here because it is security-critical and easy to get wrong. Length is
   * compared first because timingSafeEqual throws on mismatched lengths — the
   * length itself is not a secret for fixed-width hashes.
   */
  static safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
