import { Role } from '@kamala/db';

import { PasswordService } from '../src/modules/auth/password.service';
import {
  createUser,
  db,
  http,
  resetRateLimits,
  startApp,
  stopApp,
  truncateAll,
  TEST_PASSWORD,
} from './harness';

/**
 * Password reset and email confirmation.
 *
 * Both hand a stranger a one-time credential by email, so the properties worth
 * protecting are the ones that make that safe: the token works once, it stops
 * working when it expires, and a completed reset closes every session the
 * account had open.
 *
 * Tokens are stored hashed, so a test cannot read one back out of the database.
 * These mint a token through the same service the application uses and insert
 * the matching row — which exercises the real lookup rather than a stub.
 */
describe('account recovery', () => {
  let passwords: PasswordService;

  beforeAll(async () => {
    const app = await startApp();
    passwords = app.get(PasswordService);
  });

  afterAll(async () => {
    await stopApp();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  /** Issues a reset token for a user and returns the plaintext half. */
  async function issueResetToken(
    userId: string,
    options: { expiresInMs?: number; usedAt?: Date } = {},
  ): Promise<string> {
    const token = passwords.generateToken();
    await db().passwordResetToken.create({
      data: {
        userId,
        tokenHash: passwords.hashToken(token),
        expiresAt: new Date(Date.now() + (options.expiresInMs ?? 15 * 60_000)),
        ...(options.usedAt && { usedAt: options.usedAt }),
      },
    });
    return token;
  }

  async function issueVerificationToken(
    userId: string,
    options: { expiresInMs?: number } = {},
  ): Promise<string> {
    const token = passwords.generateToken();
    await db().emailVerificationToken.create({
      data: {
        userId,
        tokenHash: passwords.hashToken(token),
        expiresAt: new Date(Date.now() + (options.expiresInMs ?? 24 * 3_600_000)),
      },
    });
    return token;
  }

  // -------------------------------------------------------------------------

  describe('requesting a reset', () => {
    /**
     * The single most important property here. This endpoint is unauthenticated
     * and trivially scriptable, so any difference between a known and unknown
     * address turns it into a bulk tool for discovering who holds an account.
     */
    it('answers identically whether or not the address is registered', async () => {
      const user = await createUser({ role: Role.BUYER });

      const known = await http()
        .post('/api/auth/request-password-reset')
        .send({ email: user.email })
        .expect(200);

      await resetRateLimits();

      const unknown = await http()
        .post('/api/auth/request-password-reset')
        .send({ email: 'nobody-has-this-address@selleasy24.test' })
        .expect(200);

      expect(unknown.body).toEqual(known.body);
    });

    it('issues a token for a real account and none for a stranger', async () => {
      const user = await createUser({ role: Role.BUYER });

      await http()
        .post('/api/auth/request-password-reset')
        .send({ email: user.email })
        .expect(200);

      expect(await db().passwordResetToken.count({ where: { userId: user.id } })).toBe(1);

      await resetRateLimits();

      await http()
        .post('/api/auth/request-password-reset')
        .send({ email: 'nobody-has-this-address@selleasy24.test' })
        .expect(200);

      // Still only the one, from the real account above.
      expect(await db().passwordResetToken.count()).toBe(1);
    });
  });

  // -------------------------------------------------------------------------

  describe('using a reset token', () => {
    const NEW_PASSWORD = 'BrandNewPassword456!';

    it('sets the new password and leaves the old one dead', async () => {
      const user = await createUser({ role: Role.BUYER });
      const token = await issueResetToken(user.id);

      await http()
        .post('/api/auth/reset-password')
        .send({ token, password: NEW_PASSWORD })
        .expect(200);

      await resetRateLimits();

      await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: NEW_PASSWORD })
        .expect(200);

      await resetRateLimits();

      await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(401);
    });

    /**
     * A reset is the remedy for a suspected compromise. Leaving the intruder's
     * refresh tokens alive would make the whole exercise pointless.
     */
    it('closes every session the account had open', async () => {
      const user = await createUser({ role: Role.BUYER });

      const login = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(200);
      const refreshToken = login.body.refreshToken;

      await resetRateLimits();

      const token = await issueResetToken(user.id);
      await http()
        .post('/api/auth/reset-password')
        .send({ token, password: NEW_PASSWORD })
        .expect(200);

      await resetRateLimits();

      await http().post('/api/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('refuses a token that has already been used', async () => {
      const user = await createUser({ role: Role.BUYER });
      const token = await issueResetToken(user.id);

      await http()
        .post('/api/auth/reset-password')
        .send({ token, password: NEW_PASSWORD })
        .expect(200);

      await resetRateLimits();

      await http()
        .post('/api/auth/reset-password')
        .send({ token, password: 'YetAnotherPassword789!' })
        .expect(401);
    });

    it('refuses an expired token', async () => {
      const user = await createUser({ role: Role.BUYER });
      const token = await issueResetToken(user.id, { expiresInMs: -1000 });

      await http()
        .post('/api/auth/reset-password')
        .send({ token, password: NEW_PASSWORD })
        .expect(401);
    });

    it('refuses a token nobody issued', async () => {
      await http()
        .post('/api/auth/reset-password')
        .send({ token: 'not-a-token-anyone-ever-issued', password: NEW_PASSWORD })
        .expect(401);
    });

    /**
     * A reset also clears a lockout. Without this, an attacker could lock
     * someone out of the account they had just recovered simply by failing to
     * sign in five times.
     */
    it('clears a lockout so the recovered account is usable', async () => {
      const user = await createUser({ role: Role.BUYER });
      await db().user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 900_000) },
      });

      const token = await issueResetToken(user.id);
      await http()
        .post('/api/auth/reset-password')
        .send({ token, password: NEW_PASSWORD })
        .expect(200);

      const after = await db().user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.failedLoginAttempts).toBe(0);
      expect(after.lockedUntil).toBeNull();

      await resetRateLimits();

      await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: NEW_PASSWORD })
        .expect(200);
    });

    it('still enforces the password policy', async () => {
      const user = await createUser({ role: Role.BUYER });
      const token = await issueResetToken(user.id);

      await http()
        .post('/api/auth/reset-password')
        .send({ token, password: 'short' })
        .expect(400);

      // And the token survives, so a rejected attempt does not cost the user
      // their one chance at recovery.
      const record = await db().passwordResetToken.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(record.usedAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------

  describe('confirming an email address', () => {
    it('marks the address confirmed', async () => {
      const user = await createUser({ role: Role.BUYER, emailVerified: false });
      const token = await issueVerificationToken(user.id);

      await http().post('/api/auth/verify-email').send({ token }).expect(200);

      const after = await db().user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.isEmailVerified).toBe(true);
    });

    it('refuses a replayed link', async () => {
      const user = await createUser({ role: Role.BUYER, emailVerified: false });
      const token = await issueVerificationToken(user.id);

      await http().post('/api/auth/verify-email').send({ token }).expect(200);
      await http().post('/api/auth/verify-email').send({ token }).expect(401);
    });

    it('refuses an expired link', async () => {
      const user = await createUser({ role: Role.BUYER, emailVerified: false });
      const token = await issueVerificationToken(user.id, { expiresInMs: -1000 });

      await http().post('/api/auth/verify-email').send({ token }).expect(401);

      const after = await db().user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.isEmailVerified).toBe(false);
    });

    it('refuses a token nobody issued', async () => {
      await http()
        .post('/api/auth/verify-email')
        .send({ token: 'not-a-token-anyone-ever-issued' })
        .expect(401);
    });

    /** Registration is what sends the link, so it must leave a token behind. */
    it('issues a token when an account is created', async () => {
      await http()
        .post('/api/auth/register')
        .send({
          email: 'confirms-on-register@selleasy24.test',
          password: 'RegisterPassword123!',
          fullName: 'Registers Once',
          role: Role.BUYER,
        })
        .expect(201);

      const user = await db().user.findUniqueOrThrow({
        where: { email: 'confirms-on-register@selleasy24.test' },
        select: { id: true },
      });

      expect(await db().emailVerificationToken.count({ where: { userId: user.id } })).toBe(1);
    });
  });
});
