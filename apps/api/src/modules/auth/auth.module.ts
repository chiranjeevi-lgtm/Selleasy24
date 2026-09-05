import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { ReferralsModule } from '../referrals/referrals.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    // Secrets are passed per-call in TokenService rather than registered here,
    // because access and refresh tokens are signed with different keys.
    JwtModule.register({}),
    // AuthService.register calls into ReferralsService.redeemSafely after the
    // user is created, so the redemption lands atomically with signup rather
    // than requiring a second round trip from the client.
    ReferralsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService],
  exports: [PasswordService, TokenService],
})
export class AuthModule {}
