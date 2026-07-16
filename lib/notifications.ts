import cron from "node-cron";
import type { PrismaClient } from "@prisma/client";
import logger from "@/lib/logger";
import { config } from "@/lib/config";
import { sendPlanEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
import { weekRange } from "@/lib/week";
import { TYPE_INFO } from "@/lib/entry-types";

const log = logger.child({ module: "notifications" });

const globalForScheduler = globalThis as unknown as {
  notificationSchedulerStarted?: boolean;
};

export function startNotificationScheduler(): void {
  if (globalForScheduler.notificationSchedulerStarted) return;
  const schedule = config.notifications.cronSchedule;
  if (!cron.validate(schedule)) {
    log.error({ schedule }, "Invalid NOTIFY_CRON_SCHEDULE — scheduler not started");
    return;
  }
  cron.schedule(schedule, async () => {
    log.info("Running hourly notification check");
    const { default: prisma } = await import("@/lib/prisma");
    try {
      await queueDueNotifications(prisma);
      await dispatchPendingNotifications(prisma);
    } catch (err) {
      log.error({ err }, "Hourly notification cron failed");
    }
  });
  globalForScheduler.notificationSchedulerStarted = true;
  log.info({ schedule }, "Notification scheduler started");
}

/**
 * Finds users whose configured weekday/hour matches the current moment and
 * who have an S-Dienst in the current week, then queues one notification
 * per user (skips users already queued for this week, so retries of the
 * same hour don't produce duplicates).
 */
export async function queueDueNotifications(
  prisma: PrismaClient,
  now = new Date(),
  opts: { force?: boolean } = {}
): Promise<number> {
  const { force = false } = opts;
  const weekday = now.getDay();
  const hour = now.getHours();
  const { start, end } = weekRange(now);

  const dueUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      notifyEnabled: true,
      ...(force ? {} : { notifyWeekday: weekday, notifyHour: hour }),
    },
  });

  let queued = 0;
  for (const user of dueUsers) {
    const sDuties = await prisma.entry.findMany({
      where: { userId: user.id, type: "S", date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
    });
    if (sDuties.length === 0) continue;

    if (!force) {
      const alreadyQueued = await prisma.pendingNotification.findFirst({
        where: { userId: user.id, createdAt: { gte: new Date(`${start}T00:00:00`) } },
      });
      if (alreadyQueued) continue;
    }

    const dates = sDuties.map((e) => e.date).join(", ");
    const subject = `Sanitätsplaner: Dein S-Dienst diese Woche`;
    const body = `Hallo ${user.name}\n\nDu hast diese Woche ${TYPE_INFO.S.label} an folgenden Tagen: ${dates}.`;

    await prisma.pendingNotification.create({
      data: { userId: user.id, channel: user.notifyChannel, subject, body },
    });
    queued++;
  }
  return queued;
}

/** Sends all not-yet-sent PendingNotification rows and stamps sentAt/failedAt. */
export async function dispatchPendingNotifications(prisma: PrismaClient): Promise<void> {
  const pending = await prisma.pendingNotification.findMany({
    where: { sentAt: null },
    include: { user: true },
  });
  if (pending.length === 0) return;

  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    log.warn("No SystemSettings row — cannot dispatch notifications");
    return;
  }

  for (const notification of pending) {
    try {
      if (notification.channel === "Email") {
        await sendPlanEmail(settings, notification.user.email, notification.subject, notification.body);
      } else {
        if (!notification.user.telegramChatId) {
          throw new Error(`User ${notification.user.id} has no telegramChatId configured`);
        }
        await sendTelegramMessage(settings, notification.user.telegramChatId, notification.body);
      }
      await prisma.pendingNotification.update({
        where: { id: notification.id },
        data: { sentAt: new Date() },
      });
    } catch (err) {
      log.error({ err, notificationId: notification.id }, "Failed to dispatch notification");
      await prisma.pendingNotification.update({
        where: { id: notification.id },
        data: { failedAt: new Date(), error: err instanceof Error ? err.message : String(err) },
      });
    }
  }
}
