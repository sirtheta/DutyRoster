import prisma from "@/lib/prisma";
import { config } from "@/lib/config";
import { requireAdmin } from "@/lib/permissions";
import { SettingsForm } from "@/components/settings-form";
import { DevToolsCard } from "@/components/dev-tools-card";
import { FailedNotificationsCard } from "@/components/failed-notifications-card";

const failedAtFormat = new Intl.DateTimeFormat("de-CH", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: config.notifications.timezone,
});

export default async function SettingsPage() {
  await requireAdmin();
  // Only the fields the form displays — the encrypted smtpPassword and
  // telegramBotToken ciphertexts stay on the server.
  const [settings, failedNotifications] = await Promise.all([
    prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { smtpHost: true, smtpPort: true, smtpUser: true, smtpFromName: true },
    }),
    prisma.pendingNotification.findMany({
      where: { sentAt: null, failedAt: { not: null } },
      include: { user: { select: { name: true } } },
      orderBy: { failedAt: "desc" },
      take: 20,
    }),
  ]);

  const failures = failedNotifications.map((n) => ({
    id: n.id,
    userName: n.user.name,
    channel: n.channel,
    failedAtLabel: n.failedAt ? failedAtFormat.format(n.failedAt) : "",
    attempts: n.attempts,
    error: n.error,
  }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl">Einstellungen</h1>
      {failures.length > 0 && (
        <FailedNotificationsCard
          failures={failures}
          maxAttempts={config.notifications.maxAttempts}
        />
      )}
      <SettingsForm settings={settings} />
      {process.env.NODE_ENV !== "production" && <DevToolsCard />}
    </div>
  );
}
