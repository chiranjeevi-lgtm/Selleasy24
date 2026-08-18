import 'reflect-metadata';

import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Nest's own logger is buffered until pino takes over, so boot-time errors
    // are still visible.
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<Env, true>);
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const port = config.get('API_PORT', { infer: true });
  const allowedOrigins = config.get('CORS_ALLOWED_ORIGINS', { infer: true });
  const isProduction = nodeEnv === 'production';

  // --- Security headers -----------------------------------------------------
  app.use(
    helmet({
      // The API serves JSON, not documents, so a restrictive CSP costs nothing.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      // Presigned document URLs point at the storage host; a full referrer would
      // leak our path structure to it.
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  // Express advertises itself by default; there is no reason to tell an attacker
  // what to look up.
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  /**
   * Behind DigitalOcean App Platform / Cloudflare, the client IP arrives in
   * X-Forwarded-For. Without this, rate limiting and audit logs would record
   * the proxy's address for every request — making per-IP limits useless.
   *
   * Set to 1 rather than `true`: trusting the whole chain lets a client forge
   * the header and evade rate limits.
   */
  app.set('trust proxy', 1);

  // --- CORS -----------------------------------------------------------------
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  });

  // --- Body limits ----------------------------------------------------------
  // Documents and photos are uploaded as multipart and bounded separately by the
  // upload interceptor; JSON bodies never legitimately approach this size.
  app.useBodyParser('json', { limit: '256kb' });
  app.useBodyParser('urlencoded', { limit: '256kb', extended: true });

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());

  // --- API documentation ----------------------------------------------------
  // Never exposed in production: it enumerates every endpoint and schema.
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SellEasy24 API')
      .setDescription('Trust-first PropTech platform — Telangana residential market')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  // Ensures Prisma disconnects and in-flight requests drain on SIGTERM, which is
  // how container orchestrators stop a task.
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  const logger = new NestLogger('Bootstrap');
  logger.log(`API listening on port ${port} (${nodeEnv})`);
  logger.log(`CORS origins: ${allowedOrigins.join(', ')}`);
  if (!isProduction) {
    logger.log(`API docs at http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
