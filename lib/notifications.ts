import cron from "node-cron";
import type { NotifyChannel, PrismaClient } from "@prisma/client";
import logger from "@/lib/logger";
import { config } from "@/lib/config";
import { sendPlanEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
import { partiallyUncoveredDaysInRange, uncoveredWeeksInRange, weekRange } from "@/lib/week";
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
        await queueCoverageAlerts(prisma);
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
 * Finds users with an S-Dienst in the current week. For a single duty, the
 * notification is sent on the actual duty day; weeks with multiple duties
 * keep the configured weekly reminder. Repeated scheduler runs do not
 * produce duplicates.
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
    },
  });

  let queued = 0;
  for (const user of dueUsers) {
    const sDuties = await prisma.entry.findMany({
      where: { userId: user.id, type: "S", date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
    });
    if (sDuties.length === 0) continue;

    const isSingleDutyDay = sDuties.length === 1 && sDuties[0].date === today;
    const isConfiguredWeeklySlot =
      user.notifyWeekday === weekday && user.notifyHour === hour && user.notifyMinute === minute;
    if (!force && !isSingleDutyDay && !isConfiguredWeeklySlot) continue;

    const firstDate = formatDateCH(sDuties[0].date);
    const lastDate = formatDateCH(sDuties[sDuties.length - 1].date);
    const dateRange = firstDate === lastDate ? `am ${firstDate}` : `von ${firstDate} bis ${lastDate}`;
    const subject =
      sDuties.length === 1
        ? `Sanitätsplaner: Dein S-Dienst am ${firstDate}`
        : `Sanitätsplaner: Dein S-Dienst diese Woche`;

    if (!force) {
      const alreadyQueued = await prisma.pendingNotification.findFirst({
        where: {
          userId: user.id,
          subject,
          createdAt: { gte: new Date(`${start}T00:00:00`) },
        },
      });
      if (alreadyQueued) continue;
    }

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

const COVERAGE_ALERT_SUBJECT = "Sanitätsplaner: Ungedeckte Diensttage";

/**
 * Alerts active Admins once/day about uncovered S-Dienst weeks/days for the
 * rest of the year. Always Email, plus Telegram if chat id set — ignores
 * notifyEnabled (operational alert, not a personal reminder). Re-queues on
 * later days while unresolved.
 */
export async function queueCoverageAlerts(prisma: PrismaClient, now = new Date()): Promise<number> {
  const { date: today } = zonedParts(now, config.notifications.timezone);
  const year = parseInt(today.slice(0, 4), 10);
  const coverageFrom = weekRange(parseDate(today)!).start;
  const coverageTo = `${year}-12-31`;

  const [sDuties, holidays] = await Promise.all([
    prisma.entry.findMany({ where: { type: "S", date: { startsWith: `${year}-` } }, select: { date: true } }),
    prisma.holiday.findMany({ where: { year }, select: { date: true } }),
  ]);
  const sDutyDates = new Set(sDuties.map((e) => e.date));
  const holidayDates = new Set(holidays.map((h) => h.date));

  const uncoveredWeeks = uncoveredWeeksInRange(coverageFrom, coverageTo, sDutyDates, holidayDates).filter((w) =>
    w.dates.some((d) => d >= today)
  );
  const uncoveredDays = partiallyUncoveredDaysInRange(coverageFrom, coverageTo, sDutyDates, holidayDates).filter(
    (d) => d >= today
  );
  if (uncoveredWeeks.length === 0 && uncoveredDays.length === 0) return 0;

  const sections: string[] = [];
  if (uncoveredWeeks.length > 0) {
    sections.push(
      `Ungedeckte Wochen: ${uncoveredWeeks.map((w) => `KW ${w.weekNumber}`).join(", ")} — für diese Wochen ist niemand für den Sanitäts-Dienst eingeteilt.`
    );
  }
  if (uncoveredDays.length > 0) {
    sections.push(
      `Ungedeckte Tage: ${uncoveredDays.map(formatDateCH).join(", ")} — an diesen Tagen ist trotz Dienst in der übrigen Woche niemand eingeteilt.`
    );
  }

  const admins = await prisma.user.findMany({ where: { isActive: true, role: "Admin" } });
  const todayStart = new Date(`${today}T00:00:00`);

  let queued = 0;
  for (const admin of admins) {
    const alreadyQueued = await prisma.pendingNotification.findFirst({
      where: { userId: admin.id, subject: COVERAGE_ALERT_SUBJECT, createdAt: { gte: todayStart } },
    });
    if (alreadyQueued) continue;

    const body = `Hallo ${admin.name}\n\n${sections.join("\n\n")}`;
    const channels: NotifyChannel[] = ["Email"];
    if (admin.telegramChatId) channels.push("Telegram");
    for (const channel of channels) {
      await prisma.pendingNotification.create({
        data: { userId: admin.id, channel, subject: COVERAGE_ALERT_SUBJECT, body },
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
