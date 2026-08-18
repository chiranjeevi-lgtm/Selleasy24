/**
 * Loads .env.test into process.env before any application module is imported.
 *
 * Runs as a Jest `setupFiles` entry rather than `setupFilesAfterEach`, because
 * the config module validates the environment at import time — by the time the
 * test framework is up it is already too late.
 *
 * Refuses to run against anything but a `_test` database. The suite truncates
 * every table between cases, so a misconfigured DATABASE_URL here would quietly
 * destroy development data instead of failing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const ENV_TEST = join(ROOT, '.env.test');

if (!existsSync(ENV_TEST)) {
  throw new Error(
    'No .env.test at the repo root. Run `npm run test:setup` before the tests.',
  );
}

for (const line of readFileSync(ENV_TEST, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;

  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;

  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  // A real environment variable wins, so CI can override without editing files.
  process.env[key] ??= value;
}

const url = process.env.DATABASE_URL ?? '';
const databaseName = url.slice(url.lastIndexOf('/') + 1).split('?')[0] ?? '';

if (!databaseName.endsWith('_test')) {
  throw new Error(
    `Refusing to run tests against database "${databaseName}" — the name must end in _test. ` +
      'The suite truncates every table, and this guard is what stops it running against development data.',
  );
}
