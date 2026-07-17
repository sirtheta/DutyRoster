import { describe, it, expect, vi, beforeEach } from "vitest";
import { compare } from "bcryptjs";
import { createTestDatabase, createTestUser } from "../test-utils";
import {
  createPasswordResetToken,
  consumePasswordResetToken,
  hashResetToken,
  RESET_TOKEN_TTL_MS,
} from "@/lib/password-reset";
import { resetRateLimit } from "@/lib/rate-limit";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "10.0.0.1", host: "localhost:3000" }),
}));

const mockSendPlanEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({
  get sendPlanEmail() {
    return mockSendPlanEmail;
  },
}));

const db = createTestDatabase();
vi.mock("@/lib/prisma", () => ({ get default() { return db.prisma; } }));

describe("password reset tokens", () => {
  it("stores only the token hash and validates the raw token once", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser() });

    const token = await createPasswordResetToken(prisma, user.id);
    const stored = await prisma.passwordResetToken.findFirstOrThrow();
    expect(stored.tokenHash).toBe(hashResetToken(token));
    expect(stored.tokenHash).not.toContain(token);

    expect(await consumePasswordResetToken(prisma, token)).toBe(user.id);
    // Second use of the same token fails.
    expect(await consumePasswordResetToken(prisma, token)).toBeNull();
  });

  it("rejects unknown and expired tokens", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser() });

    expect(await consumePasswordResetToken(prisma, "not-a-real-token")).toBeNull();

    const token = await createPasswordResetToken(prisma, user.id);
    const afterExpiry = new Date(Date.now() + RESET_TOKEN_TTL_MS + 1000);
    expect(await consumePasswordResetToken(prisma, token, afterExpiry)).toBeNull();
  });

  it("invalidates older tokens when a new one is requested", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser() });

    const first = await createPasswordResetToken(prisma, user.id);
    const second = await createPasswordResetToken(prisma, user.id);

    expect(await consumePasswordResetToken(prisma, first)).toBeNull();
    expect(await consumePasswordResetToken(prisma, second)).toBe(user.id);
  });
});

describe("password reset actions", () => {
  beforeEach(() => {
    mockSendPlanEmail.mockClear();
    resetRateLimit("pwreset-ip:10.0.0.1");
    resetRateLimit("pwreset-consume:10.0.0.1");
  });

  it("sends a reset link and the full flow changes the password", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({
      data: createTestUser({ email: "flow@example.com", passwordHash: "old-hash" }),
    });
    await prisma.systemSettings.create({
      data: { id: 1, smtpHost: "smtp.example.com", smtpUser: "u@example.com", smtpPassword: "x" },
    });

    const { requestPasswordResetAction } = await import("@/app/(auth)/forgot-password/actions");
    const form = new FormData();
    form.set("email", "flow@example.com");
    const requestResult = await requestPasswordResetAction(undefined, form);
    expect(requestResult).toEqual({ success: true });

    expect(mockSendPlanEmail).toHaveBeenCalledOnce();
    const body: string = mockSendPlanEmail.mock.calls[0][3];
    const token = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(body)?.[1];
    expect(token).toBeTruthy();

    const { resetPasswordAction } = await import("@/app/(auth)/reset-password/actions");
    const resetForm = new FormData();
    resetForm.set("token", token!);
    resetForm.set("password", "brand-new-password");
    resetForm.set("passwordConfirm", "brand-new-password");
    const resetResult = await resetPasswordAction(undefined, resetForm);
    expect(resetResult).toEqual({ success: true });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await compare("brand-new-password", updated.passwordHash)).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityType: "User" } });
    expect(JSON.parse(audit.details!)).toMatchObject({ action: "passwordReset" });
  });

  it("answers generically for unknown or inactive accounts and sends nothing", async () => {
    const { prisma } = db;
    await prisma.user.create({
      data: createTestUser({ email: "inactive@example.com", isActive: false }),
    });

    const { requestPasswordResetAction } = await import("@/app/(auth)/forgot-password/actions");
    for (const email of ["unknown@example.com", "inactive@example.com"]) {
      const form = new FormData();
      form.set("email", email);
      expect(await requestPasswordResetAction(undefined, form)).toEqual({ success: true });
    }
    expect(mockSendPlanEmail).not.toHaveBeenCalled();
  });

  it("rejects mismatched confirmation and invalid tokens", async () => {
    const { resetPasswordAction } = await import("@/app/(auth)/reset-password/actions");

    const mismatch = new FormData();
    mismatch.set("token", "whatever");
    mismatch.set("password", "long-enough-pw");
    mismatch.set("passwordConfirm", "different-pw");
    expect((await resetPasswordAction(undefined, mismatch)).error).toMatch(/stimmen nicht/);

    const invalid = new FormData();
    invalid.set("token", "definitely-not-valid");
    invalid.set("password", "long-enough-pw");
    invalid.set("passwordConfirm", "long-enough-pw");
    expect((await resetPasswordAction(undefined, invalid)).error).toMatch(/ungültig/);
  });
});
