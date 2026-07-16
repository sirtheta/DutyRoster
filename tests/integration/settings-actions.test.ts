import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Session } from "next-auth";
import { createTestDatabase, createTestUser } from "../test-utils";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const db = createTestDatabase();
vi.mock("@/lib/prisma", () => ({ get default() { return db.prisma; } }));

let currentSession: Session;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => currentSession) }));

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

function sessionFor(userId: number, role: "Admin" | "Editor" | "Viewer"): Session {
  return { user: { id: String(userId), name: "Test", email: "test@example.com", role }, expires: "2099-01-01" } as Session;
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("settings actions", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("rejects a non-admin from updating settings", async () => {
    const editor = await db.prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    currentSession = sessionFor(editor.id, "Editor");

    const { updateSettingsAction } = await import("@/app/(app)/settings/actions");
    await expect(updateSettingsAction(undefined, formData({ smtpHost: "smtp.example.com" }))).rejects.toThrow(
      "REDIRECT:/calendar"
    );
  });

  it("creates settings and encrypts the SMTP password and Telegram bot token", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { updateSettingsAction } = await import("@/app/(app)/settings/actions");
    const res = await updateSettingsAction(
      undefined,
      formData({
        smtpHost: "smtp.example.com",
        smtpPort: "587",
        smtpUser: "user@example.com",
        smtpPassword: "hunter2",
        telegramBotToken: "bot-token",
      })
    );

    expect(res.success).toBe(true);
    const settings = await db.prisma.systemSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(settings.smtpHost).toBe("smtp.example.com");
    expect(settings.smtpPassword).not.toBe("hunter2");
    expect(settings.smtpPassword).toMatch(/^enc:v1:/);
    expect(settings.telegramBotToken).toMatch(/^enc:v1:/);
    const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { entityType: "Settings" } });
    expect(audit.action).toBe("SETTINGS");
  });

  it("leaves an existing telegramBotToken untouched when the field is left blank", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");
    await db.prisma.systemSettings.create({ data: { id: 1, telegramBotToken: "enc:v1:existing" } });

    const { updateSettingsAction } = await import("@/app/(app)/settings/actions");
    await updateSettingsAction(undefined, formData({ smtpHost: "smtp.example.com" }));

    const settings = await db.prisma.systemSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(settings.telegramBotToken).toBe("enc:v1:existing");
  });

  it("rejects invalid input (non-numeric SMTP port)", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { updateSettingsAction } = await import("@/app/(app)/settings/actions");
    const res = await updateSettingsAction(undefined, formData({ smtpPort: "not-a-number" }));

    expect(res.error).toBe("Ungültige Eingabe.");
  });

  it("triggerNotificationCheck queues and dispatches outside production", async () => {
    process.env.NODE_ENV = "development";
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin", notifyEnabled: true }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { triggerNotificationCheck } = await import("@/app/(app)/settings/actions");
    const res = await triggerNotificationCheck();

    expect(res.success).toBe(true);
    expect(res.queued).toBeGreaterThanOrEqual(0);
    const audit = await db.prisma.auditLog.findFirstOrThrow({
      where: { entityType: "Settings", details: { contains: "triggerNotificationCheck" } },
    });
    expect(JSON.parse(audit.details!)).toMatchObject({ action: "triggerNotificationCheck" });
  });

  it("triggerNotificationCheck refuses to run in production", async () => {
    process.env.NODE_ENV = "production";
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { triggerNotificationCheck } = await import("@/app/(app)/settings/actions");
    const res = await triggerNotificationCheck();

    expect(res.error).toMatch(/Entwicklungsumgebungen/);
  });

  it("triggerNotificationCheck reports an error instead of throwing when the pipeline fails", async () => {
    process.env.NODE_ENV = "development";
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");
    const spy = vi.spyOn(db.prisma.user, "findMany").mockRejectedValueOnce(new Error("db unavailable"));

    const { triggerNotificationCheck } = await import("@/app/(app)/settings/actions");
    const res = await triggerNotificationCheck();

    expect(res.error).toBe("db unavailable");
    spy.mockRestore();
  });
});
