import { describe, it, expect } from "vitest";
import { OTP } from "otplib";
import {
  generateBackupCodes,
  hashBackupCodes,
  matchBackupCode,
  verifyTotpOrBackup,
} from "@/lib/backup-codes";

const otp = new OTP({ strategy: "totp" });

describe("backup-codes", () => {
  it("generates the requested number of unique XXXX-XXXX codes", () => {
    const codes = generateBackupCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("hashes codes so the plaintext is not recoverable from storage", () => {
    const codes = generateBackupCodes(2);
    const hashed = hashBackupCodes(codes);
    expect(hashed).toHaveLength(2);
    for (const h of hashed) expect(h).not.toBe(codes);
  });

  it("matches a hashed backup code regardless of case", () => {
    const [code] = generateBackupCodes(1);
    const [hash] = hashBackupCodes([code]);
    expect(matchBackupCode([hash], code.toLowerCase())).toBe(0);
  });

  it("returns -1 for input that isn't the backup-code format (skips bcrypt)", () => {
    const [hash] = hashBackupCodes(generateBackupCodes(1));
    expect(matchBackupCode([hash], "123456")).toBe(-1);
  });

  it("returns -1 when no hash matches", () => {
    const [hash] = hashBackupCodes(generateBackupCodes(1));
    expect(matchBackupCode([hash], "ZZZZ-ZZZZ")).toBe(-1);
  });

  describe("verifyTotpOrBackup", () => {
    it("validates a live TOTP token without consuming a backup code", () => {
      const secret = otp.generateSecret();
      const token = otp.generateSync({ secret });
      const result = verifyTotpOrBackup(token, secret, []);
      expect(result).toEqual({ valid: true, consumedIndex: null });
    });

    it("falls back to a backup code when the token isn't TOTP-shaped", () => {
      const secret = otp.generateSecret();
      const codes = generateBackupCodes(3);
      const hashed = hashBackupCodes(codes);
      const result = verifyTotpOrBackup(codes[1], secret, hashed);
      expect(result).toEqual({ valid: true, consumedIndex: 1 });
    });

    it("returns invalid when neither TOTP nor backup code matches", () => {
      const secret = otp.generateSecret();
      const hashed = hashBackupCodes(generateBackupCodes(2));
      const result = verifyTotpOrBackup("000000", secret, hashed);
      expect(result).toEqual({ valid: false });
    });
  });
});
