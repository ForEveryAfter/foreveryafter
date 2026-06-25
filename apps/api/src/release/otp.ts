// OTP for package downloads. Raw 6-digit code goes out via SMS (separate channel
// from the account link, per spec). We store ONLY a salted SHA-256 hash; no code
// ever lives in DB, logs, response bodies, or stack traces.

import { randomInt, createHash, randomBytes, timingSafeEqual } from 'crypto';

const OTP_PEPPER = process.env.OTP_PEPPER || ''; // strongly recommended to set in .env
const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export function generateOtpCode(): string {
  // 100000–999999 → always 6 digits.
  return String(randomInt(100_000, 1_000_000));
}

// Salt is per-package and stored alongside the hash. Salt + pepper + code →
// hash. Without OTP_PEPPER set the implementation still works (pepper is "");
// we recommend you set it in .env so a stolen DB alone can't brute-force codes.
export function hashOtpCode(rawCode: string, salt: string): string {
  return createHash('sha256').update(`${salt}.${OTP_PEPPER}.${rawCode}`).digest('hex');
}

// Salt is encoded into the stored hash field as `${salt}:${hashHex}` so a single
// column carries both. Verification re-derives the hash with the stored salt.
export function makeOtpHash(rawCode: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${hashOtpCode(rawCode, salt)}`;
}

export function verifyOtpAgainstHash(rawCode: string, stored: string): boolean {
  const idx = stored.indexOf(':');
  if (idx <= 0) return false;
  const salt = stored.slice(0, idx);
  const want = stored.slice(idx + 1);
  const got = hashOtpCode(rawCode, salt);
  if (want.length !== got.length) return false;
  // constant-time compare to avoid timing attacks
  return timingSafeEqual(Buffer.from(want, 'hex'), Buffer.from(got, 'hex'));
}

// Lockout policy (decisions, not state). Caller writes/reads from release_packages
// columns; these functions just expose the rules.
export const OTP_POLICY = {
  MAX_ATTEMPTS: MAX_OTP_ATTEMPTS,
  LOCKOUT_MINUTES,
  // Returns the timestamp to write into otp_locked_until once attempts hit the cap.
  lockUntil(now: Date = new Date()): Date {
    return new Date(now.getTime() + LOCKOUT_MINUTES * 60_000);
  },
  // True iff caller should block — locked AND lockout window hasn't elapsed yet.
  isLocked(otpLockedUntil: string | null | undefined): boolean {
    if (!otpLockedUntil) return false;
    return new Date(otpLockedUntil).getTime() > Date.now();
  },
};
