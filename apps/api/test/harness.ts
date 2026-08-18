import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient, Role, SellerKind } from '@kamala/db';
import { hash } from '@node-rs/argon2';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Shared test harness.
 *
 * Boots the real application — real guards, real pipes, real database — because
 * the invariants these tests exist to protect are properties of that whole
 * stack, not of any one service in isolation.
 */

let app: INestApplication | null = null;
let prisma: PrismaClient | null = null;

export async function startApp(): Promise<INestApplication> {
  if (app) {
    return app;
  }

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication();

  /*
   * Mirrors main.ts. If the test app is configured differently from the real
   * one, the tests stop being evidence about production behaviour — a missing
   * global prefix would make every route 404 and send us hunting for a bug that
   * does not exist.
   *
   * No global ValidationPipe: this project validates with Zod through
   * ZodValidationPipe at each route, and Nest's built-in pipe would pull in
   * class-validator, which is deliberately not a dependency.
   *
   * helmet and CORS are omitted — they are transport concerns that supertest
   * does not exercise, and nothing here asserts on them.
   */
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.init();

  prisma = new PrismaClient();
  await prisma.$connect();

  return app;
}

export async function stopApp(): Promise<void> {
  await prisma?.$disconnect();
  await app?.close();
  prisma = null;
  app = null;
}

export function db(): PrismaClient {
  if (!prisma) {
    throw new Error('Call startApp() before using db().');
  }
  return prisma;
}

export function http() {
  if (!app) {
    throw new Error('Call startApp() before using http().');
  }
  return request(app.getHttpServer());
}

/**
 * Empties every table between tests.
 *
 * Discovered from the catalogue rather than listed by hand: a table added later
 * would otherwise leak rows between tests, and the resulting failures look like
 * flakiness rather than a missing line here.
 *
 * `_prisma_migrations` is excluded — dropping it would make the schema look
 * unmigrated to every later connection.
 */
/**
 * Clears rate-limit counters between tests.
 *
 * The throttler keys by IP, and every request in a run comes from the same
 * address — so without this, the fourth code request in a suite returns 429 and
 * the failure reads as a bug in the feature rather than an exhausted bucket.
 *
 * Resetting rather than raising the limits keeps the real thresholds in force,
 * so a test that deliberately exercises throttling still can.
 */
export async function resetRateLimits(): Promise<void> {
  /*
   * Reaches into `_storage`, the in-memory Map behind ThrottlerStorageService.
   * That is a private field, so this is deliberately defensive: if a future
   * version renames it, the throw below fails the suite immediately with a clear
   * message, rather than letting every test quietly start returning 429.
   */
  const storage = mustApp().get<{ _storage?: unknown }>(ThrottlerStorage, { strict: false });
  const map = storage?._storage;

  if (!(map instanceof Map)) {
    throw new Error(
      'Could not reset rate limits: ThrottlerStorageService no longer exposes a `_storage` Map. ' +
        'Update resetRateLimits() in test/harness.ts.',
    );
  }

  map.clear();
}

export async function truncateAll(): Promise<void> {
  await resetRateLimits();

  const client = db();

  const tables = await client.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  // CASCADE because of the foreign keys; RESTART IDENTITY so sequence-backed
  // columns do not drift upward across a long run.
  await client.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const TEST_PASSWORD = 'TestPassword123!';

/** Matches the API's own argon2 parameters so login actually verifies. */
async function passwordHash(): Promise<string> {
  return hash(TEST_PASSWORD, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

let userCounter = 0;

/**
 * Creates a user directly in the database and signs them in through the real
 * login endpoint, so the returned token is one the guards actually accept.
 */
export async function createUser(options: {
  role: Role;
  sellerKind?: SellerKind;
  reraNumber?: string;
  phone?: string | null;
  emailVerified?: boolean;
  /**
   * Defaults to true so fixtures are submittable. Tests that care about the
   * verification gate set it false explicitly, which keeps the requirement
   * visible at the point it matters instead of hidden in every other setup.
   */
  phoneVerified?: boolean;
}): Promise<TestUser> {
  userCounter += 1;
  const email = `test-user-${userCounter}@selleasy24.test`;

  const created = await db().user.create({
    data: {
      email,
      fullName: `Test User ${userCounter}`,
      passwordHash: await passwordHash(),
      role: options.role,
      sellerKind: options.sellerKind ?? null,
      reraNumber: options.reraNumber ?? null,
      // Unique per user: the column is unique, and a shared number would make
      // the second fixture fail with a confusing constraint error.
      phone: options.phone === undefined ? `+9198765${String(43000 + userCounter)}` : options.phone,
      isEmailVerified: options.emailVerified ?? true,
      isPhoneVerified: options.phoneVerified ?? options.phone !== null,
    },
    select: { id: true, email: true, role: true },
  });

  return { id: created.id, email: created.email, accessToken: await signAccessToken(created) };
}

/**
 * Mints an access token the way the application does.
 *
 * Fixtures deliberately do NOT go through POST /auth/login. Sign-in is rate
 * limited to five attempts per fifteen minutes per IP, and every request in a
 * test run comes from the same address — so a suite that logged each fixture in
 * would start returning 429 after the fifth user and fail in a way that looks
 * like an authorization bug rather than a throttle.
 *
 * The rate limit is a feature worth keeping, so it stays on and the login
 * endpoint gets exercised by its own dedicated tests instead.
 *
 * The payload mirrors TokenService exactly. If that shape changes, these tokens
 * stop being accepted and every suite fails loudly rather than silently drifting
 * out of step with production.
 */
export async function signAccessToken(user: { id: string; role: Role }): Promise<string> {
  const jwt = mustApp().get(JwtService);
  const config = mustApp().get(ConfigService);

  return jwt.signAsync(
    { sub: user.id, role: user.role, typ: 'access' },
    {
      secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: config.getOrThrow<string>('JWT_ACCESS_TTL'),
    },
  );
}

function mustApp(): INestApplication {
  if (!app) {
    throw new Error('Call startApp() before minting tokens.');
  }
  return app;
}

/** A locality to hang properties off. */
export async function createNeighborhood(name = 'Gachibowli'): Promise<{ id: string }> {
  return db().neighborhood.create({
    data: { name, city: 'Hyderabad', state: 'Telangana', pincode: '500032' },
    select: { id: true },
  });
}

export const bearer = (user: TestUser): [string, string] => [
  'Authorization',
  `Bearer ${user.accessToken}`,
];
