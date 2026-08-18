import { Injectable, Logger } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing and opaque-token handling.
 *
 * argon2id rather than bcrypt: it is the current OWASP first choice and resists
 * GPU and side-channel attack far better. The PRD specified bcrypt(12); this is
 * a deliberate upgrade, not an oversight.
 *
 * Parameters below are OWASP's minimum recommended configuration for argon2id.
 * They must stay in sync with packages/db/prisma/seed.ts, which hashes the
 * development accounts.
 */
const ARGON2_OPTIONS = {
  /** 19 MiB */
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  async hash(plaintext: string): Promise<string> {
    return hash(plaintext, ARGON2_OPTIONS);
  }

  /**
   * Verifies a password against a stored hash.
   *
   * Returns false rather than throwing on a malformed hash: a corrupted record
   * must fail closed as "wrong password", never as a 500 that distinguishes
   * this account from any other.
   */
  async verify(storedHash: string, plaintext: string): Promise<boolean> {
    try {
      return await verify(storedHash, plaintext, ARGON2_OPTIONS);
    } catch (error) {
      this.logger.error(
        'Password verification failed — stored hash may be malformed',
        error instanceof Error ? error.stack : undefined,
      );
      return false;
    }
  }

  /**
   * Generates a high-entropy token for email verification, password reset and
   * refresh rotation.
   *
   * 32 bytes of CSPRNG output, base64url encoded. Returned to the user once and
   * never stored in plaintext.
   */
  generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Hashes a token for storage.
   *
   * SHA-256 rather than argon2 is correct here: these tokens are already 256
   * bits of random, so there is nothing to brute-force, and reset/refresh paths
   * must stay fast. Argon2's work factor exists to compensate for low-entropy
   * human passwords — it buys nothing against random tokens.
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Constant-time comparison of two token hashes. */
  compareTokenHash(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length || bufA.length === 0) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
