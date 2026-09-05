import { Role, SellerKind } from '@kamala/db';
import { z } from 'zod';

/**
 * Password policy.
 *
 * Composition rules follow the PRD (8+ chars, upper, digit, symbol). The upper
 * bound is a denial-of-service guard, not a usability rule: argon2 hashing cost
 * scales with input length, so an unbounded password is a cheap way to burn
 * server CPU.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character');

/** Indian mobile in E.164 (+91XXXXXXXXXX), or a general E.164 number. */
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in international format, e.g. +919876543210');

/** Requests a one-time code for a phone number. */
export const requestOtpSchema = z.object({
  phone: phoneSchema,
});
export type RequestOtpDto = z.infer<typeof requestOtpSchema>;

/** Confirms a one-time code. */
export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'Enter the 6-digit code'),
});
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(255);

/**
 * Username — alternative sign-in identifier alongside email.
 *
 * Lowercased at write, unique. Constrained so a username can never be
 * mistaken for an email (must not contain '@') and never collides with
 * URL routing conventions (letters, digits, underscore only, no dot or
 * slash).
 */
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, digits and underscore');

/**
 * Login identifier — email or username. Distinguished by presence of '@';
 * downstream code looks up by the right column.
 */
const loginIdentifierSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Enter your email or username')
  .max(255);

/**
 * Registration.
 *
 * `role` is deliberately restricted to BUYER, OWNER and BROKER. Staff roles are
 * assigned by an administrator, never self-selected — without this constraint a
 * caller could register directly as ADMIN. The ZodValidationPipe also strips
 * unknown keys, so extra fields cannot reach Prisma.
 */
export const registerSchema = z
  .object({
    email: emailSchema,
    /**
     * Username is required for new signups so every new account has both
     * identifiers from day one. Legacy accounts (from before this field
     * shipped) have username = null and continue to sign in via email.
     */
    username: usernameSchema,
    password: passwordSchema,
    fullName: z.string().trim().min(2, 'Enter your full name').max(255),
    phone: phoneSchema.optional(),
    role: z.enum([Role.BUYER, Role.OWNER, Role.BROKER]).default(Role.BUYER),
    /** Required for brokers — RERA registration is a legal precondition to list. */
    reraNumber: z.string().trim().min(3).max(64).optional(),
    /**
     * Optional referral code carried through from the `?ref=CODE` URL param
     * on the register page. Validated leniently here — the ReferralsService
     * normalises + does the strict check + swallows invalid codes so a
     * mistyped code never fails the signup itself.
     */
    referralCode: z
      .string()
      .trim()
      .max(16)
      .regex(/^[a-zA-Z0-9]*$/, 'Referral codes are letters and numbers only')
      .optional(),
  })
  .refine((data) => data.role !== Role.BROKER || Boolean(data.reraNumber), {
    message: 'Brokers must supply a RERA registration number',
    path: ['reraNumber'],
  });

export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  /**
   * Email OR username. The '@' character decides which column to look up;
   * usernames are validated to never contain '@' so the two cannot overlap.
   */
  identifier: loginIdentifierSchema,
  // No policy validation on login: rules apply when setting a password, and
  // enforcing them here would leak the policy a stored password was created under.
  password: z.string().min(1, 'Password is required').max(128),
});

export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshDto = z.infer<typeof refreshSchema>;

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export type RequestPasswordResetDto = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;

/** Shape returned to clients. Never includes passwordHash or lockout state. */
export interface AuthenticatedUserResponse {
  id: string;
  email: string;
  /** Present for accounts created after the username field shipped; legacy accounts have null. */
  username: string | null;
  fullName: string;
  role: Role;
  sellerKind: SellerKind | null;
  isEmailVerified: boolean;
  phone: string | null;
  /**
   * Whether the number above has been confirmed by a one-time code. A seller
   * cannot submit a listing without it, so the interface needs to distinguish
   * "no number" from "number not yet verified".
   */
  isPhoneVerified: boolean;
}
