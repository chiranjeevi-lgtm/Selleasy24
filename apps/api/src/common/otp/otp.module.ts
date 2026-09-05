import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { OtpDelivery } from './otp-delivery';
import { OtpDeliveryFactory } from './otp-delivery.factory';
import { PhoneVerificationService } from './phone-verification.service';

/**
 * Phone verification.
 *
 * The delivery driver is bound through a factory so swapping console for a real
 * provider is a configuration change. Nothing that injects `OtpDelivery` knows
 * or cares which one it received.
 */
@Global()
@Module({
  providers: [
    {
      provide: OtpDelivery,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => OtpDeliveryFactory.create(config),
    },
    PhoneVerificationService,
  ],
  exports: [PhoneVerificationService, OtpDelivery],
})
export class OtpModule {}
