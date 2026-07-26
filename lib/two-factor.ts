import { OTP } from "otplib";
import QRCode from "qrcode";
import { encryptSecret } from "@/lib/crypto";

const otp = new OTP({ strategy: "totp" });

const ISSUER = "Sanitätsplaner";

/** Generates a new base32 TOTP secret, ready to store encrypted via `encryptSecret`. */
export function generateTwoFactorSecret(): string {
  return otp.generateSecret();
}

/** Builds the otpauth:// URI and a scannable QR code (data URL) for the setup screen. */
export async function generateTwoFactorSetup(
  email: string,
  secret: string
): Promise<{ otpauthUrl: string; qrDataUrl: string }> {
  const otpauthUrl = otp.generateURI({ issuer: ISSUER, label: email, secret });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  return { otpauthUrl, qrDataUrl };
}

/** Encrypts a freshly generated secret for storage (mirrors SMTP/Telegram secrets). */
export function encryptTwoFactorSecret(secret: string): string {
  return encryptSecret(secret);
}

/** Verifies a 6-digit TOTP code against an already-decrypted secret. */
export function verifyTotpCode(secret: string, token: string): boolean {
  try {
    return otp.verifySync({ token: token.trim(), secret }).valid;
  } catch {
    return false;
  }
}
