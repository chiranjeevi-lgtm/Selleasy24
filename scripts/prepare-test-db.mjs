/**
 * Creates the test database if it does not exist, then brings its schema up to
 * date with `prisma migrate deploy`.
 *
 * `migrate deploy` rather than `migrate dev`: deploy only applies committed
 * migrations and never generates new ones or prompts, which is what a
 * non-interactive test run needs. It also means the tests exercise exactly the
 * migrations that will run in production, so a migration that works on an empty
 * database but fails on a populated one gets caught here rather than on deploy.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_TEST = join(ROOT, '.env.test');

if (!existsSync(ENV_TEST)) {
  console.error('No .env.test — run `npm run test:env` first.');
  process.exit(1);
}

const line = readFileSync(ENV_TEST, 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('DATABASE_URL='));

if (!line) {
  console.error('.env.test has no DATABASE_URL.');
  process.exit(1);
}

const testUrl = new URL(line.slice('DATABASE_URL='.length));
const testDbName = testUrl.pathname.replace(/^\//, '');

if (!testDbName.endsWith('_test')) {
  // A guard, not a formality: everything below truncates and migrates this
  // database, and pointing it at the development one would destroy real data.
  console.error(
    `Refusing to prepare "${testDbName}" — the test database name must end in _test.`,
  );
  process.exit(1);
}

/** Connect to the maintenance database to issue CREATE DATABASE. */
const adminUrl = new URL(testUrl.toString());
adminUrl.pathname = '/postgres';

const { Client } = await import('pg').catch(() => ({ Client: null }));

if (Client) {
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    testDbName,
  ]);
  if (existing.rowCount === 0) {
    // Identifier cannot be parameterised; quoted to prevent injection through a
    // crafted database name.
    await client.query(`CREATE DATABASE "${testDbName.replace(/"/g, '""')}"`);
    console.log(`Created database ${testDbName}.`);
  } else {
    console.log(`Database ${testDbName} already exists.`);
  }
  await client.end();
} else {
  console.error('The `pg` package is required to create the test database.');
  process.exit(1);
}

execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: join(ROOT, 'packages', 'db'),
  env: { ...process.env, DATABASE_URL: testUrl.toString() },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

console.log('Test database schema is up to date.');
