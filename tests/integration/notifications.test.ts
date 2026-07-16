import { describe, it, expect, vi, beforeEach } from "vitest";
import cron from "node-cron";
import { createTestDatabase, createTestUser } from "../test-utils";
import { queueDueNotifications, dispatchPendingNotifications } from "@/lib/notifications";

vi.mock("node-cron", () => ({ default: { schedule: vi.fn(), validate: vi.fn(() => true) } }));

const mockSendMail = vi.fn().mockResolvedValue({});
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
}));

const db = createTestDatabase();
vi.mock("@/lib/prisma", () => ({ get default() { return db.prisma; } }));

describe("notifications", () => {
  beforeEach(() => {
    mockSendMail.mockClear();
    vi.mocked(cron.schedule).mockClear();
    vi.mocked(cron.validate).mockClear().mockReturnValue(true);
    delete (globalThis as unknown as { notificationSchedulerStarted?: boolean }).notificationSchedulerStarted;
  });

  it("queues a notification only for users due this hour with an S-Dienst this week", async () => {
    const { prisma } = db;
    const now = new Date(2026, 2, 2, 7, 0, 0); // Monday 2026-03-02, 07:00
    const dueUser = await prisma.user.create({
      data: createTestUser({
        email: "due@example.com",
        notifyEnabled: true,
        notifyWeekday: 1,
        notifyHour: 7,
      }),
    });
    const notDueUser = await prisma.user.create({
      data: createTestUser({
        email: "notdue@example.com",
        notifyEnabled: true,
        notifyWeekday: 2,
        notifyHour: 7,
      }),
    });
    await prisma.entry.create({ data: { userId: dueUser.id, date: "2026-03-03", type: "S" } });
    await prisma.entry.create({ data: { userId: notDueUser.id, date: "2026-03-04", type: "S" } });

    const queued = await queueDueNotifications(prisma, now);
    expect(queued).toBe(1);

    const pending = await prisma.pendingNotification.findMany();
    expect(pending).toHaveLength(1);
    expect(pending[0].userId).toBe(dueUser.id);

    // Running again the same hour does not double-queue.
    const queuedAgain = await queueDueNotifications(prisma, now);
    expect(queuedAgain).toBe(0);
  });

  it("does not queue a due user without an S-Dienst this week", async () => {
    const { prisma } = db;
    const now = new Date(2026, 2, 2, 7, 0, 0);
    await prisma.user.create({
      data: createTestUser({ notifyEnabled: true, notifyWeekday: 1, notifyHour: 7 }),
    });

    const queued = await queueDueNotifications(prisma, now);
    expect(queued).toBe(0);
  });

  it("dispatches pending email notifications and stamps sentAt", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser({ email: "recipient@example.com" }) });
    await prisma.systemSettings.create({
      data: {
        id: 1,
        smtpHost: "smtp.example.com",
        smtpPort: 587,
        smtpUser: "user@example.com",
        smtpPassword: "secret",
      },
    });
    const notification = await prisma.pendingNotification.create({
      data: { userId: user.id, channel: "Email", subject: "Test", body: "Hallo" },
    });

    await dispatchPendingNotifications(prisma);

    expect(mockSendMail).toHaveBeenCalledOnce();
    const updated = await prisma.pendingNotification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(updated.sentAt).not.toBeNull();
    expect(updated.failedAt).toBeNull();
  });

  it("marks a notification as failed when dispatch throws", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser({ email: "recipient@example.com" }) });
    // No SystemSettings row with SMTP configured -> sendPlanEmail throws.
    await prisma.systemSettings.create({ data: { id: 1 } });
    const notification = await prisma.pendingNotification.create({
      data: { userId: user.id, channel: "Email", subject: "Test", body: "Hallo" },
    });

    await dispatchPendingNotifications(prisma);

    const updated = await prisma.pendingNotification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(updated.sentAt).toBeNull();
    expect(updated.failedAt).not.toBeNull();
    expect(updated.error).toBeTruthy();
  });

  it("does nothing when there is no SystemSettings row", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser() });
    const notification = await prisma.pendingNotification.create({
      data: { userId: user.id, channel: "Email", subject: "Test", body: "Hallo" },
    });

    await dispatchPendingNotifications(prisma);

    const updated = await prisma.pendingNotification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(updated.sentAt).toBeNull();
    expect(updated.failedAt).toBeNull();
  });

  it("marks a Telegram notification as failed when the user has no telegramChatId", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser({ telegramChatId: null }) });
    await prisma.systemSettings.create({ data: { id: 1 } });
    const notification = await prisma.pendingNotification.create({
      data: { userId: user.id, channel: "Telegram", subject: "Test", body: "Hallo" },
    });

    await dispatchPendingNotifications(prisma);

    const updated = await prisma.pendingNotification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(updated.sentAt).toBeNull();
    expect(updated.failedAt).not.toBeNull();
    expect(updated.error).toContain("telegramChatId");
  });

  it("does not register a cron job when the schedule is invalid", async () => {
    vi.mocked(cron.validate).mockReturnValueOnce(false);
    const { startNotificationScheduler } = await import("@/lib/notifications");

    startNotificationScheduler();

    expect(cron.schedule).not.toHaveBeenCalled();
  });

  it("registers an hourly cron job that runs the notification pipeline once", async () => {
    const { startNotificationScheduler } = await import("@/lib/notifications");

    startNotificationScheduler();
    startNotificationScheduler(); // second call is a no-op (already started)

    expect(cron.schedule).toHaveBeenCalledTimes(1);
    const callback = vi.mocked(cron.schedule).mock.calls[0][1] as () => Promise<void>;
    await expect(callback()).resolves.toBeUndefined();
  });

  it("logs and swallows an error thrown inside the scheduled job", async () => {
    const { startNotificationScheduler } = await import("@/lib/notifications");
    startNotificationScheduler();
    const callback = vi.mocked(cron.schedule).mock.calls[0][1] as () => Promise<void>;

    const spy = vi.spyOn(db.prisma.user, "findMany").mockRejectedValueOnce(new Error("boom"));
    await expect(callback()).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
