import { randomInt } from "crypto";
import { OTP } from "otplib";
import { hashSync, compareSync } from "bcryptjs";
import { bcryptRounds } from "@/lib/password";

const otp = new OTP({ strategy: "totp" });

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous I/O/0/1
const CODE_FORMAT = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const part = (n: number) => Array.from({ length: n }, () => CHARS[randomInt(CHARS.length)]).join("");
    return `${part(4)}-${part(4)}`;
  });
}

/** Hashes plaintext backup codes for storage — codes are shown once, then only verified. */
export function hashBackupCodes(codes: string[]): string[] {
  return codes.map((c) => hashSync(c, bcryptRounds));
}

/** Matches user input against stored bcrypt hashes of backup codes; returns the matched index or -1. */
export function matchBackupCode(hashedCodes: string[], input: string): number {
  const normalized = input.trim().toUpperCase();
  // Skip the expensive bcrypt compares for inputs that can't be a backup code
  if (!CODE_FORMAT.test(normalized)) return -1;
  return hashedCodes.findIndex((hash) => compareSync(normalized, hash));
}

export type VerifyResult =
  | { valid: true; consumedIndex: null } // TOTP matched
  | { valid: true; consumedIndex: number } // backup code matched
  | { valid: false };

/** Verifies a login-time code: a live TOTP code, or (as fallback) an unused backup code. */
export function verifyTotpOrBackup(input: string, secret: string, hashedBackupCodes: string[]): VerifyResult {
  try {
    // otplib throws for malformed (e.g. non-6-digit) tokens — fall through to backup codes
    const result = otp.verifySync({ token: input.trim(), secret });
    if (result.valid) return { valid: true, consumedIndex: null };
  } catch {
    // not a TOTP-shaped token
  }

  const idx = matchBackupCode(hashedBackupCodes, input);
  if (idx === -1) return { valid: false };
  return { valid: true, consumedIndex: idx };
}
