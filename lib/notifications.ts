import cron from "node-cron";
import type { NotifyChannel, PrismaClient } from "@prisma/client";
import logger from "@/lib/logger";
import { config } from "@/lib/config";
import { sendPlanEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
import { weekRange } from "@/lib/week";
import { formatDateCH, isValidTimeZone, parseDate, zonedParts } from "@/lib/date";
import { TYPE_INFO } from "@/lib/entry-types";

const log = logger.child({ module: "notifications" });

/**
 * Resolves which channel(s) a queued notification should go out on. A user
 * can have both Email and Telegram enabled at once; if Telegram is enabled
 * without a chat ID configured, it's dropped (falling back to Email if that's
 * the only channel left) rather than failing delivery entirely.
 */
export function notifyChannelsFor(user: {
  notifyEmail: boolean;
  notifyTelegram: boolean;
  telegramChatId: string | null;
}): NotifyChannel[] {
  const channels: NotifyChannel[] = [];
  if (user.notifyEmail) channels.push("Email");
  if (user.notifyTelegram) {
    if (user.telegramChatId) channels.push("Telegram");
    else if (!user.notifyEmail) channels.push("Email");
  }
  return channels;
}

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
  const timezone = config.notifications.timezone;
  if (!isValidTimeZone(timezone)) {
    log.error({ timezone }, "Invalid NOTIFY_TIMEZONE — scheduler not started");
    return;
  }
  cron.schedule(
    schedule,
    async () => {
      log.info("Running notification check");
      const { default: prisma } = await import("@/lib/prisma");
      try {
        await queueDueNotifications(prisma);
        await dispatchPendingNotifications(prisma);
        await pruneExpiredNotifications(prisma);
        const { pruneExpiredAuditLogs } = await import("@/lib/audit");
        await pruneExpiredAuditLogs(prisma);
      } catch (err) {
        log.error({ err }, "Notification cron failed");
      }
    },
    { timezone }
  );
  globalForScheduler.notificationSchedulerStarted = true;
  log.info({ schedule }, "Notification scheduler started");
}

/**
 * Finds users whose configured weekday/hour/minute matches the current
 * moment and who have an S-Dienst in the current week, then queues one
 * notification per user (skips users already queued for this week, so
 * retries of the same slot don't produce duplicates).
 */
export async function queueDueNotifications(
  prisma: PrismaClient,
  now = new Date(),
  opts: { force?: boolean } = {}
): Promise<number> {
  const { force = false } = opts;
  // Users configure weekday/hour/minute in the app timezone
  // (NOTIFY_TIMEZONE), so evaluate `now` there — the server itself may run
  // in UTC (e.g. Docker).
  const { weekday, hour, minute, date: today } = zonedParts(now, config.notifications.timezone);
  const { start, end } = weekRange(parseDate(today)!);

  const dueUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      notifyEnabled: true,
      ...(force ? {} : { notifyWeekday: weekday, notifyHour: hour, notifyMinute: minute }),
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

    const firstDate = formatDateCH(sDuties[0].date);
    const lastDate = formatDateCH(sDuties[sDuties.length - 1].date);
    const dateRange = firstDate === lastDate ? `am ${firstDate}` : `von ${firstDate} bis ${lastDate}`;
    const subject = `Sanitätsplaner: Dein S-Dienst diese Woche`;
    const body = `Hallo ${user.name}\n\nDu hast diese Woche ${TYPE_INFO.S.label} ${dateRange}.`;

    const channels = notifyChannelsFor(user);
    if (channels.length === 0) continue;
    for (const channel of channels) {
      await prisma.pendingNotification.create({
        data: { userId: user.id, channel, subject, body },
      });
    }
    queued++;
  }
  return queued;
}

/**
 * Sends all not-yet-sent PendingNotification rows and stamps sentAt/failedAt.
 * Rows that failed fewer than NOTIFY_MAX_ATTEMPTS times are retried on the
 * next run; after that they stay marked failed (visible on the settings page)
 * instead of being re-attempted every hour forever.
 */
export async function dispatchPendingNotifications(prisma: PrismaClient): Promise<void> {
  const pending = await prisma.pendingNotification.findMany({
    where: { sentAt: null, attempts: { lt: config.notifications.maxAttempts } },
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
        data: { sentAt: new Date(), failedAt: null, error: null, attempts: { increment: 1 } },
      });
    } catch (err) {
      log.error({ err, notificationId: notification.id }, "Failed to dispatch notification");
      await prisma.pendingNotification.update({
        where: { id: notification.id },
        data: {
          failedAt: new Date(),
          error: err instanceof Error ? err.message : String(err),
          attempts: { increment: 1 },
        },
      });
    }
  }
}

/**
 * Deletes PendingNotification rows older than the retention window
 * (NOTIFY_RETENTION_DAYS, 0 = keep forever) so the queue table doesn't grow
 * without bound. Returns the number of deleted rows.
 */
export async function pruneExpiredNotifications(
  prisma: PrismaClient,
  now = new Date()
): Promise<number> {
  const days = config.notifications.retentionDays;
  if (days <= 0) return 0;
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const { count } = await prisma.pendingNotification.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  if (count > 0) log.info({ count, days }, "Pruned expired notifications");
  return count;
}
