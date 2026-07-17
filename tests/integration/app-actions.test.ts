import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import { hash } from "bcryptjs";
import { createTestDatabase, createTestUser } from "../test-utils";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const db = createTestDatabase();
vi.mock("@/lib/prisma", () => ({ get default() { return db.prisma; } }));

let currentSession: Session;
const mockSignOut = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => currentSession), signOut: (...args: unknown[]) => mockSignOut(...args) }));

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

const mockSendPlanEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendPlanEmail: (...args: unknown[]) => mockSendPlanEmail(...args) }));

const mockSendTelegramMessage = vi.fn();
vi.mock("@/lib/telegram", () => ({ sendTelegramMessage: (...args: unknown[]) => mockSendTelegramMessage(...args) }));

function sessionFor(userId: number, role: "Admin" | "Editor" | "Viewer"): Session {
  return { user: { id: String(userId), name: "Test", email: "test@example.com", role }, expires: "2099-01-01" } as Session;
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("app actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signOutAction delegates to next-auth signOut", async () => {
    const { signOutAction } = await import("@/app/(app)/actions");
    await signOutAction();
    expect(mockSignOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });

  it("regenerateIcalTokenAction rotates the caller's token and logs an audit entry", async () => {
    const user = await db.prisma.user.create({ data: createTestUser({ icalToken: "old-token" }) });
    currentSession = sessionFor(user.id, "Editor");

    const { regenerateIcalTokenAction } = await import("@/app/(app)/actions");
    const res = await regenerateIcalTokenAction();

    expect(res.error).toBeUndefined();
    const updated = await db.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.icalToken).not.toBe("old-token");
    const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { entityType: "User" } });
    expect(JSON.parse(audit.details!)).toMatchObject({ action: "regenerateIcalToken" });
  });

  it("updateIcalIncludeVacationAction toggles the caller's own iCal feed scope and logs an audit entry", async () => {
    const user = await db.prisma.user.create({ data: createTestUser({ icalIncludeVacation: true }) });
    currentSession = sessionFor(user.id, "Editor");

    const { updateIcalIncludeVacationAction } = await import("@/app/(app)/actions");
    const res = await updateIcalIncludeVacationAction(false);

    expect(res.error).toBeUndefined();
    const updated = await db.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.icalIncludeVacation).toBe(false);
    const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { entityType: "User" } });
    expect(JSON.parse(audit.details!)).toMatchObject({ action: "updateIcalIncludeVacation", includeVacation: false });
  });

  it("changeOwnPasswordAction rejects non-string form fields", async () => {
    const user = await db.prisma.user.create({ data: createTestUser() });
    currentSession = sessionFor(user.id, "Editor");

    const { changeOwnPasswordAction } = await import("@/app/(app)/actions");
    const fd = new FormData();
    fd.set("currentPassword", "x");
    const res = await changeOwnPasswordAction(undefined, fd);

    expect(res.error).toMatch(/Ungültige Eingabe/);
  });

  it("changeOwnPasswordAction rejects a too-short new password", async () => {
    const user = await db.prisma.user.create({ data: createTestUser() });
    currentSession = sessionFor(user.id, "Editor");

    const { changeOwnPasswordAction } = await import("@/app/(app)/actions");
    const res = await changeOwnPasswordAction(
      undefined,
      formData({ currentPassword: "irrelevant-in-tests", newPassword: "short" })
    );

    expect(res.error).toMatch(/mindestens 8/);
  });

  it("changeOwnPasswordAction rejects an incorrect current password", async () => {
    const user = await db.prisma.user.create({ data: createTestUser({ passwordHash: await hash("realpassword", 4) }) });
    currentSession = sessionFor(user.id, "Editor");

    const { changeOwnPasswordAction } = await import("@/app/(app)/actions");
    const res = await changeOwnPasswordAction(
      undefined,
      formData({ currentPassword: "wrongpassword", newPassword: "newpassword1" })
    );

    expect(res.error).toMatch(/falsch/);
  });

  it("changeOwnPasswordAction updates the password when the current one matches", async () => {
    const user = await db.prisma.user.create({ data: createTestUser({ passwordHash: await hash("realpassword", 4) }) });
    currentSession = sessionFor(user.id, "Editor");

    const { changeOwnPasswordAction } = await import("@/app/(app)/actions");
    const res = await changeOwnPasswordAction(
      undefined,
      formData({ currentPassword: "realpassword", newPassword: "newpassword1" })
    );

    expect(res.success).toBe(true);
    const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { entityType: "User" } });
    expect(JSON.parse(audit.details!)).toMatchObject({ action: "changeOwnPassword" });
  });

  it("updateOwnNotificationSettingsAction saves valid settings", async () => {
    const user = await db.prisma.user.create({ data: createTestUser() });
    currentSession = sessionFor(user.id, "Editor");

    const { updateOwnNotificationSettingsAction } = await import("@/app/(app)/actions");
    const res = await updateOwnNotificationSettingsAction(
      undefined,
      formData({ notifyEnabled: "on", notifyChannel: "Email", notifyWeekday: "2", notifyHour: "9" })
    );

    expect(res.success).toBe(true);
    const updated = await db.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.notifyEnabled).toBe(true);
    expect(updated.notifyWeekday).toBe(2);
    expect(updated.notifyHour).toBe(9);
  });

  it("updateOwnNotificationSettingsAction requires a Telegram chat id when Telegram is enabled", async () => {
    const user = await db.prisma.user.create({ data: createTestUser() });
    currentSession = sessionFor(user.id, "Editor");

    const { updateOwnNotificationSettingsAction } = await import("@/app/(app)/actions");
    const res = await updateOwnNotificationSettingsAction(
      undefined,
      formData({ notifyEnabled: "on", notifyChannel: "Telegram" })
    );

    expect(res.error).toMatch(/Telegram Chat-ID/);
  });

  it("sendTestNotificationAction sends a test email", async () => {
    const user = await db.prisma.user.create({ data: createTestUser() });
    currentSession = sessionFor(user.id, "Editor");
    await db.prisma.systemSettings.create({ data: { id: 1 } });
    mockSendPlanEmail.mockResolvedValue(undefined);

    const { sendTestNotificationAction } = await import("@/app/(app)/actions");
    const res = await sendTestNotificationAction("Email");

    expect(res.success).toBe(true);
    expect(mockSendPlanEmail).toHaveBeenCalledOnce();
    const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { action: "SETTINGS" } });
    expect(JSON.parse(audit.details!)).toMatchObject({ action: "testNotification", channel: "Email" });
  });

  it("sendTestNotificationAction sends a test Telegram message", async () => {
    const user = await db.prisma.user.create({ data: createTestUser() });
    currentSession = sessionFor(user.id, "Editor");
    await db.prisma.systemSettings.create({ data: { id: 1 } });
    mockSendTelegramMessage.mockResolvedValue(undefined);

    const { sendTestNotificationAction } = await import("@/app/(app)/actions");
    const res = await sendTestNotificationAction("Telegram", "12345");

    expect(res.success).toBe(true);
    expect(mockSendTelegramMessage).toHaveBeenCalledWith(expect.anything(), "12345", expect.any(String));
    const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { action: "SETTINGS" } });
    expect(JSON.parse(audit.details!)).toMatchObject({ action: "testNotification", channel: "Telegram" });
  });

  it("sendTestNotificationAction requires a Telegram chat id", async () => {
    const user = await db.prisma.user.create({ data: createTestUser() });
    currentSession = sessionFor(user.id, "Editor");
    await db.prisma.systemSettings.create({ data: { id: 1 } });

    const { sendTestNotificationAction } = await import("@/app/(app)/actions");
    const res = await sendTestNotificationAction("Telegram");

    expect(res.error).toMatch(/Telegram Chat-ID/);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it("sendTestNotificationAction reports missing SystemSettings", async () => {
    const user = await db.prisma.user.create({ data: createTestUser() });
    currentSession = sessionFor(user.id, "Editor");

    const { sendTestNotificationAction } = await import("@/app/(app)/actions");
    const res = await sendTestNotificationAction("Email");

    expect(res.error).toMatch(/Systemeinstellungen fehlen/);
  });

  it("sendTestNotificationAction surfaces send failures as an error result", async () => {
    const user = await db.prisma.user.create({ data: createTestUser() });
    currentSession = sessionFor(user.id, "Editor");
    await db.prisma.systemSettings.create({ data: { id: 1 } });
    mockSendPlanEmail.mockRejectedValue(new Error("SMTP down"));

    const { sendTestNotificationAction } = await import("@/app/(app)/actions");
    const res = await sendTestNotificationAction("Email");

    expect(res.error).toBe("SMTP down");
  });
});
