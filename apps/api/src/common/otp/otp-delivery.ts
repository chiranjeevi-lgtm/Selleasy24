import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';

/**
 * How a one-time code reaches a phone.
 *
 * Deliberately an interface with the provider behind it, because the delivery
 * channel is the one part of this feature that is genuinely undecided —
 * Firebase, WhatsApp Business, an SMS aggregator behind TRAI DLT, or Truecaller
 * all deliver the same six digits. Everything else in the OTP flow (hashing,
 * expiry, attempt limits, replay prevention) is identical regardless, so none of
 * it should have to change when that decision is made.
 *
 * `revealCode` is what makes a walkthrough possible before any provider is
 * connected: the console driver hands the code back so the interface can show
 * it. Every real driver returns false, and the API refuses to reveal a code
 * unless the driver says it may.
 */
export interface OtpDeliveryResult {
  /** Present only when the driver permits revealing it. */
  code?: string;
  /** How the code was delivered, for display and logging. */
  channel: string;
}

export abstract class OtpDelivery {
  abstract readonly channel: string;
  /** Whether the code may be returned to the caller. False for real providers. */
  abstract readonly revealsCode: boolean;
  abstract send(phone: string, code: string): Promise<OtpDeliveryResult>;
}

/**
 * Development and demonstration driver.
 *
 * Sends nothing. Logs the code and returns it so the sign-in screen can display
 * it, which is what lets the whole registration flow be walked through without
 * an SMS provider, a DLT registration or a real handset.
 *
 * Selected only when OTP_DELIVERY is "console". Production sets a real driver,
 * and the env schema refuses to start with the console driver when NODE_ENV is
 * production — a demo shortcut reaching production would mean anyone could sign
 * in as anyone.
 */
@Injectable()
export class ConsoleOtpDelivery extends OtpDelivery {
  readonly channel = 'console';
  readonly revealsCode = true;

  private readonly logger = new Logger(ConsoleOtpDelivery.name);

  async send(phone: string, code: string): Promise<OtpDeliveryResult> {
    this.logger.warn(`[otp not delivered] ${phone} -> ${code}`);
    return { code, channel: this.channel };
  }
}

/**
 * Chooses a driver from configuration.
 *
 * A single place to add the real one: implement OtpDelivery, register it here,
 * and nothing in the service, controller or interface changes.
 */
@Injectable()
export class OtpDeliveryFactory {
  static create(config: ConfigService<Env, true>): OtpDelivery {
    const driver = config.get('OTP_DELIVERY', { infer: true });

    switch (driver) {
      case 'console':
        return new ConsoleOtpDelivery();
      default:
        // Unreachable while the env schema constrains the value, but an
        // unmatched driver must fail loudly rather than silently falling back
        // to the one that reveals codes.
        throw new Error(`Unknown OTP delivery driver: ${String(driver)}`);
    }
  }
}
