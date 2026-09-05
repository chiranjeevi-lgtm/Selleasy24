import { Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { ConsoleOtpDelivery, OtpDelivery } from './otp-delivery';
import { WhatsAppCloudApiDelivery } from './whatsapp-cloud-api-delivery';

/**
 * Chooses a driver from configuration.
 *
 * Lives in its own file to break the circular import between otp-delivery.ts
 * (which defines the abstract OtpDelivery) and whatsapp-cloud-api-delivery.ts
 * (which extends it). If the factory sat next to the abstract class as it did
 * originally, otp-delivery.ts would eagerly import the WhatsApp driver, which
 * would in turn import OtpDelivery back before the class was defined — Node
 * resolves the circular require by handing over a partial exports object, so
 * OtpDelivery came out as `undefined` and `extends OtpDelivery` blew up at
 * class-declaration time.
 *
 * Splitting the factory out means neither delivery file imports the other:
 *   otp-delivery.ts               → abstract class + ConsoleOtpDelivery
 *   whatsapp-cloud-api-delivery.ts → real driver, imports the abstract class
 *   otp-delivery.factory.ts       → imports both, picks one at bootstrap
 */
@Injectable()
export class OtpDeliveryFactory {
  static create(config: ConfigService<Env, true>): OtpDelivery {
    const driver = config.get('OTP_DELIVERY', { infer: true });

    switch (driver) {
      case 'console':
        return new ConsoleOtpDelivery();
      case 'whatsapp':
        return new WhatsAppCloudApiDelivery(config);
      default:
        // Unreachable while the env schema constrains the value, but an
        // unmatched driver must fail loudly rather than silently falling back
        // to the one that reveals codes.
        throw new Error(`Unknown OTP delivery driver: ${String(driver)}`);
    }
  }
}
