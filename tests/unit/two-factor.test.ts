import { describe, it, expect } from "vitest";
import { OTP } from "otplib";
import {
  generateTwoFactorSecret,
  generateTwoFactorSetup,
  verifyTotpCode,
} from "@/lib/two-factor";

const otp = new OTP({ strategy: "totp" });

describe("two-factor", () => {
  it("generates a base32 secret usable to produce a valid token", () => {
    const secret = generateTwoFactorSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    const token = otp.generateSync({ secret });
    expect(verifyTotpCode(secret, token)).toBe(true);
  });

  it("builds an otpauth:// URI and a QR data URL", async () => {
    const secret = generateTwoFactorSecret();
    const { otpauthUrl, qrDataUrl } = await generateTwoFactorSetup("user@example.com", secret);
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(otpauthUrl).toContain(secret);
    expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("rejects a wrong or malformed code", () => {
    const secret = generateTwoFactorSecret();
    expect(verifyTotpCode(secret, "000000")).toBe(false);
    expect(verifyTotpCode(secret, "not-a-code")).toBe(false);
  });
});
