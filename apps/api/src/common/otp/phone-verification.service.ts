import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import type { Env } from '../../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { OtpDelivery } from './otp-delivery';

/**
 * Phone verification with one-time codes.
 *
 * Only the delivery channel is stubbed for demonstration. Everything here is
 * the real implementation:
 *
 *  - codes are stored as keyed hashes, never in plaintext
 *  - codes expire, and are burned after a small number of wrong guesses
 *  - a used code cannot be replayed
 *  - requesting a new code invalidates the previous one
 *  - the verify response is identical whether the phone is unknown, the code has
 *    expired, or the code is simply wrong
 *
 * That last point matters: distinguishable failures let someone enumerate which
 * numbers are registered on the platform.
 */
@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);

  private readonly ttlMinutes: number;
  private readonly maxAttempts: number;
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly delivery: OtpDelivery,
  ) {
    this.ttlMinutes = this.config.get('OTP_TTL_MINUTES', { infer: true });
    this.maxAttempts = this.config.get('OTP_MAX_ATTEMPTS', { infer: true });
    /*
     * Keyed with the access-token secret rather than a bare SHA-256. An unkeyed
     * hash of a six-digit code is trivially reversed by a rainbow table of a
     * million entries; an HMAC is not reversible without the key.
     */
    this.secret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  private hash(phone: string, code: string): string {
    // Phone is included so a code captured for one number cannot be used for
    // another that happens to have generated the same digits.
    return createHmac('sha256', this.secret).update(`${phone}:${code}`).digest('hex');
  }

  /**
   * Issues a code.
   *
   * Returns the code itself only when the configured driver permits it — the
   * console driver during a walkthrough, never a real provider.
   */
  async request(phone: string): Promise<{ channel: string; code?: string; expiresInMinutes: number }> {
    // `randomInt` is cryptographically secure. `Math.random()` is not, and a
    // predictable OTP is equivalent to no OTP at all.
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000);

    await this.prisma.$transaction(async (tx) => {
      /*
       * Any earlier code for this number is consumed. Without this, every code
       * ever requested stays valid until it expires, so requesting repeatedly
       * widens the guessable set instead of replacing it.
       */
      await tx.phoneVerification.updateMany({
        where: { phone, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      await tx.phoneVerification.create({
        data: { phone, codeHash: this.hash(phone, code), expiresAt },
      });
    });

    const result = await this.delivery.send(phone, code);

    return {
      channel: result.channel,
      // Belt and braces: the driver decides, and the field is omitted entirely
      // rather than set to undefined by a driver that forgot.
      ...(this.delivery.revealsCode && result.code ? { code: result.code } : {}),
      expiresInMinutes: this.ttlMinutes,
    };
  }

  /**
   * Checks a code. Throws on any failure, with the same message every time.
   */
  async verify(phone: string, code: string): Promise<void> {
    const record = await this.prisma.phoneVerification.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    // Identical failure for "no code outstanding" and "wrong code", so this
    // cannot be used to discover which numbers have requested one.
    const rejection = new BadRequestException('That code is not valid. Request a new one.');

    if (!record) {
      throw rejection;
    }

    if (record.attempts >= this.maxAttempts) {
      // Burn it rather than leaving a nearly-cracked code alive.
      await this.prisma.phoneVerification.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      this.logger.warn(`OTP attempt limit reached for ${this.maskPhone(phone)}`);
      throw rejection;
    }

    const expected = Buffer.from(record.codeHash, 'hex');
    const supplied = Buffer.from(this.hash(phone, code), 'hex');

    // Constant-time: a byte-by-byte comparison leaks how much of the hash
    // matched through timing.
    const matches =
      expected.length === supplied.length && timingSafeEqual(expected, supplied);

    if (!matches) {
      await this.prisma.phoneVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw rejection;
    }

    await this.prisma.phoneVerification.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
  }

  /** Never log a full number. */
  private maskPhone(phone: string): string {
    return phone.length <= 4 ? '****' : `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`;
  }
}
