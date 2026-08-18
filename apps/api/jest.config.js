/**
 * Integration tests for the API.
 *
 * These are deliberately not unit tests with mocked repositories. Almost every
 * invariant worth protecting here — who may read a document, which listings are
 * publicly visible, whether `firstListedAt` can be moved — lives in the
 * interaction between guards, services and the database. A mocked Prisma would
 * happily agree with whatever the service claimed and prove nothing.
 */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],

  // Explicit transform rather than the ts-jest preset, so the test-only
  // tsconfig is used — the build config excludes test/ and does not declare the
  // jest types.
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },

  // Loads .env.test before any application module is imported, so the config
  // module validates the test environment rather than the development one.
  setupFiles: ['<rootDir>/test/load-env.ts'],

  /**
   * One worker. Every test file shares a single database and truncates between
   * cases; parallel workers would delete each other's fixtures mid-assertion
   * and produce failures that do not reproduce.
   */
  maxWorkers: 1,

  // Argon2 hashing is deliberately slow, and several tests create real users.
  testTimeout: 30_000,

  clearMocks: true,
  // Prisma keeps a connection pool; without this a finished run can hang.
  forceExit: true,
  detectOpenHandles: false,
};
