import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { join } from 'node:path';

import { validateEnv, type Env } from './config/env.schema';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { LeadsModule } from './modules/leads/leads.module';
import { OtpModule } from './common/otp/otp.module';
import { ListingsModule } from './modules/listings/listings.module';
import { SavedModule } from './modules/saved/saved.module';
import { SearchModule } from './modules/search/search.module';
import { VerificationModule } from './modules/verification/verification.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Single source of truth at the repo root — no per-app .env files to drift.
      // In deployed environments the platform injects real env vars and this
      // path simply does not exist, which is fine.
      envFilePath: [join(__dirname, '..', '..', '..', '.env')],
      validate: validateEnv,
    }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const nodeEnv = config.get('NODE_ENV', { infer: true });
        const isDev = nodeEnv === 'development';
        return {
          pinoHttp: {
            // Silent under test: a request log per call buries the assertion
            // failure that actually matters in thousands of lines of JSON.
            level: nodeEnv === 'test' ? 'silent' : isDev ? 'debug' : 'info',
            // Human-readable locally; structured JSON everywhere else so the log
            // platform can index it.
            transport: isDev ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,

            // PII and credential redaction. This list is the enforcement point
            // for "no personal data in logs" — extend it whenever a new
            // sensitive field is introduced, and never log a request body
            // wholesale outside of it.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-api-key"]',
                'res.headers["set-cookie"]',
                'req.body.password',
                'req.body.currentPassword',
                'req.body.newPassword',
                'req.body.token',
                'req.body.refreshToken',
                'req.body.phone',
                'req.body.email',
                'req.body.idProofNumber',
              ],
              censor: '[redacted]',
            },

            // Health probes would otherwise dominate the log volume.
            autoLogging: {
              ignore: (req) => req.url === '/api/health' || req.url === '/api/health/ready',
            },
          },
        };
      },
    }),

    /**
     * Rate limiting — ONE global bucket, overridden per route.
     *
     * Deliberately a single entry. ThrottlerGuard enforces EVERY throttler
     * configured here on EVERY route; registering additional named buckets
     * ('auth' at 5/15min, 'search' at 60/min) applied those limits platform-wide,
     * which capped ordinary browsing at 5 requests per 15 minutes. That bug is
     * invisible in development until something makes more than five requests.
     *
     * Stricter per-route limits are expressed as
     * `@Throttle({ default: { ttl, limit } })`, which overrides this config for
     * that handler only.
     */
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),

    // JwtAuthGuard is global, so JwtService must be resolvable at the root.
    JwtModule.register({}),

    CommonModule,
    PrismaModule,
    OtpModule,
    AuthModule,
    // ListingsModule before SearchModule so the seller's literal routes
    // (/listings/mine) register ahead of the public detail route. The public
    // route's :id is UUID-constrained as well, so this ordering is defence in
    // depth rather than the only thing preventing a collision.
    ListingsModule,
    SearchModule,
    LeadsModule,
    SavedModule,
    VerificationModule,
    HealthModule,
  ],
  providers: [
    /**
     * Guard order matters and is the order listed here.
     *
     *  1. ThrottlerGuard  — reject floods before doing any work, including the
     *                       database lookup the auth guard performs.
     *  2. JwtAuthGuard    — authenticate. Deny by default; @Public() opts out.
     *  3. RolesGuard      — authorise. Needs request.user from step 2.
     *
     * All three are global rather than opt-in so a new endpoint is protected by
     * omission instead of exposed by omission.
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
