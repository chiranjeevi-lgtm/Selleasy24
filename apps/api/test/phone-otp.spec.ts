import { Role } from '@kamala/db';

import { bearer, createUser, db, http, startApp, stopApp, truncateAll } from './harness';

/**
 * Phone verification.
 *
 * Only the delivery channel is stubbed for demonstrations — the code lifecycle
 * is production behaviour, so it is tested as such. An OTP that can be replayed,
 * brute-forced or read out of the database is worse than no OTP, because it
 * looks like a control while providing none.
 */
describe('phone verification', () => {
  const PHONE = '+919876500001';

  beforeAll(async () => {
    await startApp();
  });

  afterAll(async () => {
    await stopApp();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  async function requestCode(phone = PHONE) {
    const response = await http()
      .post('/api/auth/phone/request-code')
      .send({ phone })
      .expect(200);
    return response.body as { code?: string; channel: string; expiresInMinutes: number };
  }

  it('issues a six-digit code and reveals it under the console driver', async () => {
    const body = await requestCode();

    expect(body.channel).toBe('console');
    // Revealed only because the demo driver is configured; a real provider
    // returns nothing here.
    expect(body.code).toMatch(/^[0-9]{6}$/);
    expect(body.expiresInMinutes).toBeGreaterThan(0);
  });

  it('never stores the code in plaintext', async () => {
    const { code } = await requestCode();

    const rows = await db().phoneVerification.findMany({ select: { codeHash: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.codeHash).not.toContain(code!);
    // A keyed hash, so a database dump cannot be reversed with a table of the
    // million possible six-digit codes.
    expect(rows[0]!.codeHash).toHaveLength(64);
  });

  it('verifies a correct code and marks the account’s phone verified', async () => {
    const user = await createUser({ role: Role.BUYER, phone: null });
    const { code } = await requestCode();

    await http()
      .post('/api/auth/phone/verify')
      .set(...bearer(user))
      .send({ phone: PHONE, code })
      .expect(200);

    const updated = await db().user.findUniqueOrThrow({
      where: { id: user.id },
      select: { phone: true, isPhoneVerified: true },
    });
    expect(updated.phone).toBe(PHONE);
    expect(updated.isPhoneVerified).toBe(true);
  });

  it('refuses to replay a code that has already been used', async () => {
    const user = await createUser({ role: Role.BUYER, phone: null });
    const { code } = await requestCode();

    await http()
      .post('/api/auth/phone/verify')
      .set(...bearer(user))
      .send({ phone: PHONE, code })
      .expect(200);

    const second = await createUser({ role: Role.BUYER, phone: null });
    await http()
      .post('/api/auth/phone/verify')
      .set(...bearer(second))
      .send({ phone: PHONE, code })
      .expect(400);
  });

  it('invalidates the previous code when a new one is requested', async () => {
    const user = await createUser({ role: Role.BUYER, phone: null });
    const first = await requestCode();
    const second = await requestCode();

    expect(first.code).not.toBe(second.code);

    // The superseded code must not still work — otherwise every request widens
    // the set of valid codes instead of replacing it.
    await http()
      .post('/api/auth/phone/verify')
      .set(...bearer(user))
      .send({ phone: PHONE, code: first.code })
      .expect(400);

    await http()
      .post('/api/auth/phone/verify')
      .set(...bearer(user))
      .send({ phone: PHONE, code: second.code })
      .expect(200);
  });

  it('burns the code after repeated wrong guesses', async () => {
    const user = await createUser({ role: Role.BUYER, phone: null });
    const { code } = await requestCode();

    const wrong = code === '000000' ? '111111' : '000000';

    // OTP_MAX_ATTEMPTS defaults to 5.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await http()
        .post('/api/auth/phone/verify')
        .set(...bearer(user))
        .send({ phone: PHONE, code: wrong })
        .expect(400);
    }

    // Even the correct code is now dead: a nearly-brute-forced code must not
    // survive to be guessed on the next try.
    await http()
      .post('/api/auth/phone/verify')
      .set(...bearer(user))
      .send({ phone: PHONE, code })
      .expect(400);
  });

  it('rejects an expired code', async () => {
    const user = await createUser({ role: Role.BUYER, phone: null });
    const { code } = await requestCode();

    await db().phoneVerification.updateMany({
      where: { phone: PHONE },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await http()
      .post('/api/auth/phone/verify')
      .set(...bearer(user))
      .send({ phone: PHONE, code })
      .expect(400);
  });

  it('does not accept a code issued for a different number', async () => {
    const user = await createUser({ role: Role.BUYER, phone: null });
    const other = '+919876500002';
    const { code } = await requestCode(other);

    await http()
      .post('/api/auth/phone/verify')
      .set(...bearer(user))
      .send({ phone: PHONE, code })
      .expect(400);
  });

  it('refuses a number already verified on another account', async () => {
    const first = await createUser({ role: Role.BUYER, phone: null });
    const second = await createUser({ role: Role.BUYER, phone: null });

    const a = await requestCode();
    await http()
      .post('/api/auth/phone/verify')
      .set(...bearer(first))
      .send({ phone: PHONE, code: a.code })
      .expect(200);

    const b = await requestCode();
    const response = await http()
      .post('/api/auth/phone/verify')
      .set(...bearer(second))
      .send({ phone: PHONE, code: b.code });

    // Two accounts must not end up owning the same number.
    expect(response.status).toBe(409);
  });

  it('requires a session to verify', async () => {
    const { code } = await requestCode();

    // The code proves control of the number; the session says whose account it
    // attaches to. Without one there is nothing to attach it to.
    await http()
      .post('/api/auth/phone/verify')
      .send({ phone: PHONE, code })
      .expect(401);
  });

  it('rejects malformed input', async () => {
    await http().post('/api/auth/phone/request-code').send({ phone: '9876500001' }).expect(400);

    const user = await createUser({ role: Role.BUYER, phone: null });
    await http()
      .post('/api/auth/phone/verify')
      .set(...bearer(user))
      .send({ phone: PHONE, code: '12345' })
      .expect(400);
  });
});
