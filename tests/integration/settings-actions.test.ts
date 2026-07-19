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
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    global.fetch = originalFetch;
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
        smtpFromAddress: "sanitaet@example.com",
        telegramBotToken: "bot-token",
      })
    );

    expect(res.success).toBe(true);
    const settings = await db.prisma.systemSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(settings.smtpHost).toBe("smtp.example.com");
    expect(settings.smtpFromAddress).toBe("sanitaet@example.com");
    expect(settings.smtpPassword).not.toBe("hunter2");
    expect(settings.smtpPassword).toMatch(/^enc:v1:/);
    expect(settings.telegramBotToken).toMatch(/^enc:v1:/);
    const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { entityType: "Settings" } });
    expect(audit.action).toBe("SETTINGS");
  });

  it("clears a previously set smtpFromAddress when the field is submitted blank", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");
    await db.prisma.systemSettings.create({ data: { id: 1, smtpFromAddress: "sanitaet@example.com" } });

    const { updateSettingsAction } = await import("@/app/(app)/settings/actions");
    await updateSettingsAction(undefined, formData({ smtpHost: "smtp.example.com", smtpFromAddress: "" }));

    const settings = await db.prisma.systemSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(settings.smtpFromAddress).toBeNull();
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

  it("testTelegramConnectionAction verifies the unsaved form token via getMe", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ result: { username: "roster_bot" } }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { testTelegramConnectionAction } = await import("@/app/(app)/settings/actions");
    const res = await testTelegramConnectionAction(formData({ telegramBotToken: "new-token" }));

    expect(res.success).toBe(true);
    expect(res.botUsername).toBe("roster_bot");
    expect(fetchMock).toHaveBeenCalledWith("https://api.telegram.org/botnew-token/getMe");
  });

  it("testTelegramConnectionAction falls back to the stored token when the field is blank", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");
    const { encryptSecret } = await import("@/lib/crypto");
    await db.prisma.systemSettings.create({ data: { id: 1, telegramBotToken: encryptSecret("stored-token") } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: {} }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { testTelegramConnectionAction } = await import("@/app/(app)/settings/actions");
    const res = await testTelegramConnectionAction(formData({}));

    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.telegram.org/botstored-token/getMe");
  });

  it("testTelegramConnectionAction errors when no token is provided or stored", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { testTelegramConnectionAction } = await import("@/app/(app)/settings/actions");
    const res = await testTelegramConnectionAction(formData({}));

    expect(res.error).toBe("Kein Bot-Token hinterlegt. Bitte Token eingeben.");
  });

  it("testTelegramConnectionAction surfaces the Telegram API error", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, text: async () => "Unauthorized" }) as unknown as typeof fetch;

    const { testTelegramConnectionAction } = await import("@/app/(app)/settings/actions");
    const res = await testTelegramConnectionAction(formData({ telegramBotToken: "bad-token" }));

    expect(res.error).toBe("Telegram API 401: Unauthorized");
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
