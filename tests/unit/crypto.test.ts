import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("crypto", () => {
  const originalKey = process.env.ENCRYPTION_KEY;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    process.env.ENCRYPTION_KEY = "test-encryption-key-0123456789ab";
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalKey;
    process.env.NODE_ENV = originalEnv;
  });

  it("round-trips a secret through encryptSecret/decryptSecret", async () => {
    const { encryptSecret, decryptSecret, isEncrypted } = await import("@/lib/crypto");
    const encrypted = encryptSecret("hunter2");
    expect(isEncrypted(encrypted)).toBe(true);
    expect(encrypted).not.toContain("hunter2");
    expect(decryptSecret(encrypted)).toBe("hunter2");
  });

  it("passes empty and already-encrypted values through encryptSecret unchanged", async () => {
    const { encryptSecret } = await import("@/lib/crypto");
    expect(encryptSecret("")).toBe("");
    const encrypted = encryptSecret("secret");
    expect(encryptSecret(encrypted)).toBe(encrypted);
  });

  it("passes empty values through decryptSecret unchanged", async () => {
    const { decryptSecret } = await import("@/lib/crypto");
    expect(decryptSecret("")).toBe("");
  });

  it("returns legacy plaintext unchanged from decryptSecret", async () => {
    const { decryptSecret } = await import("@/lib/crypto");
    expect(decryptSecret("plaintext-secret")).toBe("plaintext-secret");
  });

  it("returns empty string when decryption fails (e.g. key changed)", async () => {
    const { encryptSecret } = await import("@/lib/crypto");
    const encrypted = encryptSecret("hunter2");

    vi.resetModules();
    process.env.ENCRYPTION_KEY = "a-completely-different-key-here";
    const { decryptSecret } = await import("@/lib/crypto");
    expect(decryptSecret(encrypted)).toBe("");
  });

  it("falls back to an insecure development key when ENCRYPTION_KEY is unset outside production", async () => {
    delete process.env.ENCRYPTION_KEY;
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
    const encrypted = encryptSecret("hunter2");
    expect(decryptSecret(encrypted)).toBe("hunter2");
  });

  it("throws in production when ENCRYPTION_KEY is unset", async () => {
    delete process.env.ENCRYPTION_KEY;
    process.env.NODE_ENV = "production";
    const { encryptSecret } = await import("@/lib/crypto");
    expect(() => encryptSecret("hunter2")).toThrow("ENCRYPTION_KEY must be set in production");
  });
});
