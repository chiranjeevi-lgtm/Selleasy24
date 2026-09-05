import { z } from 'zod';

/**
 * Environment contract, validated once at boot.
 *
 * A misconfigured secret must stop the process immediately, not surface as a
 * runtime failure on the first document upload. Every rule here exists because
 * getting it wrong is either a security hole or a silent data problem.
 */

/**
 * A signing secret: long enough to resist brute force, and not the placeholder
 * shipped in .env.example.
 *
 * `.min()` is applied before `.refine()` because refine returns a ZodEffects,
 * which no longer exposes string methods.
 */
const signingSecret = (field: string) =>
  z
    .string()
    .min(32, `${field} must be at least 32 characters`)
    .refine((v) => !v.startsWith('replace-me'), {
      message: `${field} is still set to the .env.example placeholder. Generate a real value with: openssl rand -base64 48`,
    })
    /**
     * Rejects any whitespace inside a secret.
     *
     * This exists because of a real failure: generating secrets on Windows with
     * `openssl rand -base64 48 | tr -d '\n'` strips newlines but NOT carriage
     * returns, leaving a `\r` inside the quoted value. dotenv trims it, so the
     * service works perfectly and self-consistently — while the file on disk
     * does not actually contain the secret the service is using. Anything that
     * later reads the file directly (a deploy script, a secrets import, another
     * service) silently derives a different key.
     *
     * Failing loudly at boot is far cheaper than debugging that.
     */
    .refine((v) => !/\s/.test(v), {
      message: `${field} contains whitespace — most often a stray carriage return from generating it on Windows. Regenerate with: openssl rand -base64 48 | tr -d '\\r\\n'`,
    });

/**
 * AES-256 requires exactly a 32-byte key. Validating the decoded length at boot
 * prevents a truncated or over-long key silently weakening document encryption.
 */
const base64Key32Bytes = z
  .string()
  .refine((v) => !v.startsWith('replace-me'), {
    message:
      'DOCUMENT_ENCRYPTION_KEY is still the placeholder. Generate with: openssl rand -base64 32',
  })
  /**
   * Whitespace here is more dangerous than in a signing secret: Node's base64
   * decoder silently ignores non-alphabet characters, so a key with a stray `\r`
   * decodes to the SAME 32 bytes and everything appears to work — right up until
   * a stricter decoder somewhere else produces different bytes and every stored
   * document becomes undecryptable.
   */
  .refine((v) => !/\s/.test(v), {
    message:
      'DOCUMENT_ENCRYPTION_KEY contains whitespace. Regenerate with: openssl rand -base64 32 | tr -d "\\r\\n"',
  })
  .refine(
    (v) => {
      try {
        return Buffer.from(v, 'base64').length === 32;
      } catch {
        return false;
      }
    },
    {
      message:
        'DOCUMENT_ENCRYPTION_KEY must be exactly 32 bytes, base64-encoded (openssl rand -base64 32)',
    },
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),

  // --- Database -------------------------------------------------------------
  DATABASE_URL: z.string().url(),

  // --- Redis ----------------------------------------------------------------
  REDIS_URL: z.string().url(),

  // --- HTTP -----------------------------------------------------------------
  API_PORT: z.coerce.number().int().positive().default(4000),

  /**
   * Comma-separated exact origins. Wildcards are rejected outright: with
   * credentialed requests, `*` is both invalid and a vulnerability.
   */
  CORS_ALLOWED_ORIGINS: z
    .string()
    .min(1)
    .refine((v) => !v.includes('*'), {
      message: 'CORS_ALLOWED_ORIGINS must list exact origins — wildcards are not permitted',
    })
    // The explicit return annotation keeps z.infer from widening the output of
    // this refine→transform chain to `unknown`.
    .transform((v): string[] =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o.length > 0),
    ),

  // --- JWT ------------------------------------------------------------------
  JWT_ACCESS_SECRET: signingSecret('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: signingSecret('JWT_REFRESH_SECRET'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  // --- Document encryption --------------------------------------------------
  DOCUMENT_ENCRYPTION_KEY: base64Key32Bytes,

  // --- Object storage -------------------------------------------------------
  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_REGION: z.string().min(1),
  STORAGE_ACCESS_KEY_ID: z.string().default(''),
  STORAGE_SECRET_ACCESS_KEY: z.string().default(''),
  STORAGE_BUCKET_PUBLIC: z.string().min(1),
  STORAGE_BUCKET_DOCUMENTS: z.string().min(1),
  /** Short by design. A leaked presigned document URL should expire fast. */
  DOCUMENT_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),

  // --- Email ----------------------------------------------------------------
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().min(1).default('SellEasy24 <no-reply@selleasy24.com>'),
  APP_PUBLIC_URL: z.string().url(),
  /**
   * Where to send admin-oversight notifications (new enquiries, new visit
   * requests). Kept intentionally PII-free — the notification says WHAT
   * happened on which listing, and links to the admin console for full
   * detail behind admin authentication. Comma-separated for multiple
   * recipients. Default matches the seeded admin account.
   */
  ADMIN_NOTIFICATIONS_EMAIL: z.string().min(1).default('admin@kamalainfra.dev'),
  /**
   * Absolute URL of the admin console. Used in admin-notification emails
   * so the "view details" link resolves to the right host per env.
   */
  ADMIN_PUBLIC_URL: z.string().url().default('http://localhost:3001'),

  // --- Phone verification ---------------------------------------------------

  /**
   * Which driver delivers one-time codes.
   *
   * "console" delivers nothing and returns the code to the caller so the
   * registration flow can be demonstrated without an SMS provider. The refine
   * below forbids it in production — a demo shortcut reaching production would
   * let anyone sign in as anyone.
   */
  OTP_DELIVERY: z.enum(['console', 'whatsapp']).default('console'),

  /** Minutes a code stays valid. Short: it is a credential while it lives. */
  OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(30).default(10),

  /**
   * Wrong guesses before the code is burned. Six digits is a million
   * possibilities, which is minutes of scripted work — rate limiting alone
   * does not close that, so the code itself has to expire on failure.
   */
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),

  // --- WhatsApp Cloud API (Meta) --------------------------------------------
  // Required only when OTP_DELIVERY = "whatsapp" — enforced by the refine
  // below. Optional at the field level so local dev with the console driver
  // doesn't need Meta credentials to boot.
  //
  // These come from the Meta Business Suite once the WhatsApp Business
  // Account is provisioned:
  //   PHONE_NUMBER_ID       — the Meta-assigned id (NOT the actual phone number)
  //   BUSINESS_ACCOUNT_ID   — WABA id, useful for later template management
  //   ACCESS_TOKEN          — permanent system-user token from Business Manager
  //   APP_SECRET            — the Meta App's app secret; used to verify
  //                            inbound webhook signatures (HMAC-SHA256)
  //   WEBHOOK_VERIFY_TOKEN  — arbitrary shared secret you pick, echoed back
  //                            during Meta's webhook subscription handshake
  //   TEMPLATE_NAME         — approved authentication template name
  //                            (recommended: selleasy24_login_otp)
  //   TEMPLATE_LANGUAGE     — BCP-47 language tag matching the template
  //                            (e.g. "en", "en_US", "te" for Telugu)
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  WHATSAPP_TEMPLATE_NAME: z.string().min(1).optional(),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().min(1).optional(),
})
  .refine((env) => !(env.NODE_ENV === 'production' && env.OTP_DELIVERY === 'console'), {
    path: ['OTP_DELIVERY'],
    message:
      'OTP_DELIVERY="console" returns codes to the caller and must never run in production. Configure a real delivery provider.',
  })
  // Fail at boot if OTP_DELIVERY=whatsapp is selected without the credentials
  // needed to actually send. Better here than at the first send attempt in
  // production, which would surface as a user-visible failure at the exact
  // moment they tried to sign in.
  .refine(
    (env) =>
      env.OTP_DELIVERY !== 'whatsapp' ||
      Boolean(
        env.WHATSAPP_PHONE_NUMBER_ID &&
          env.WHATSAPP_ACCESS_TOKEN &&
          env.WHATSAPP_TEMPLATE_NAME &&
          env.WHATSAPP_TEMPLATE_LANGUAGE,
      ),
    {
      path: ['OTP_DELIVERY'],
      message:
        'OTP_DELIVERY="whatsapp" requires WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_TEMPLATE_NAME, and WHATSAPP_TEMPLATE_LANGUAGE.',
    },
  );

export type Env = z.infer<typeof envSchema>;

/**
 * Validates process.env and returns the typed config, or exits.
 *
 * Errors are aggregated so a fresh checkout sees every missing variable at
 * once instead of fixing them one boot at a time.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    // Thrown rather than logged: @nestjs/config surfaces this and halts boot.
    throw new Error(`Invalid environment configuration:\n${issues}\n`);
  }

  const env = result.data;

  // Cross-field checks that a per-field schema cannot express.
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ. Sharing one secret means a leaked access token can be replayed as a refresh token.',
    );
  }

  if (env.NODE_ENV === 'production') {
    if (!env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is required in production — sellers must receive verification outcome emails.');
    }
    if (!env.STORAGE_ACCESS_KEY_ID || !env.STORAGE_SECRET_ACCESS_KEY) {
      throw new Error('Object storage credentials are required in production.');
    }
    if (env.CORS_ALLOWED_ORIGINS.some((o) => o.startsWith('http://'))) {
      throw new Error('CORS_ALLOWED_ORIGINS must use https:// in production.');
    }
  }

  return env;
}
