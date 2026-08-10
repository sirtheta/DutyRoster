import prisma from "@/lib/prisma";
import { config } from "@/lib/config";
import { requireAdmin } from "@/lib/permissions";
import { SettingsForm } from "@/components/settings-form";
import { DevToolsCard } from "@/components/dev-tools-card";
import { FailedNotificationsCard } from "@/components/failed-notifications-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const failedAtFormat = new Intl.DateTimeFormat("de-CH", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: config.notifications.timezone,
});

export default async function SettingsPage() {
  await requireAdmin();
  // The encrypted smtpPassword/telegramBotToken ciphertexts stay on the server;
  // only a derived "is a token set" boolean is forwarded to the client component.
  const [settings, failedNotifications] = await Promise.all([
    prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpFromName: true,
        smtpFromAddress: true,
        telegramBotToken: true,
      },
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

  const telegramBotTokenSet = Boolean(settings?.telegramBotToken);
  const formSettings = settings && {
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpUser: settings.smtpUser,
    smtpFromName: settings.smtpFromName,
    smtpFromAddress: settings.smtpFromAddress,
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl">Einstellungen</h1>
      {failures.length > 0 && (
        <FailedNotificationsCard
          failures={failures}
          maxAttempts={config.notifications.maxAttempts}
        />
      )}
      <SettingsForm
        settings={formSettings ?? null}
        telegramBotTokenSet={telegramBotTokenSet}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automatische Abläufe</CardTitle>
          <CardDescription>Über Umgebungsvariablen konfigurierbar</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Benachrichtigungen</dt>
            <dd className="font-mono text-xs">{config.notifications.cronSchedule}</dd>
            <dt className="text-muted-foreground">Zeitzone</dt>
            <dd className="font-mono text-xs">{config.notifications.timezone}</dd>
            <dt className="text-muted-foreground">Max. Zustellversuche</dt>
            <dd className="font-mono text-xs">{config.notifications.maxAttempts}</dd>
            <dt className="text-muted-foreground">Benachrichtigungen aufbewahren</dt>
            <dd className="font-mono text-xs">
              {config.notifications.retentionDays === 0
                ? "unbegrenzt"
                : `${config.notifications.retentionDays} Tage`}
            </dd>
            <dt className="text-muted-foreground">Backup</dt>
            <dd className="font-mono text-xs">{config.backup.cronSchedule}</dd>
            <dt className="text-muted-foreground">Backups aufbewahren</dt>
            <dd className="font-mono text-xs">
              {config.backup.maxKeepDays === 0 ? "alle" : `${config.backup.maxKeepDays} Tage`}
            </dd>
            <dt className="text-muted-foreground">Audit-Log aufbewahren</dt>
            <dd className="font-mono text-xs">
              {config.audit.retentionDays === 0
                ? "unbegrenzt"
                : `${config.audit.retentionDays} Tage`}
            </dd>
          </dl>
        </CardContent>
      </Card>

      {process.env.NODE_ENV !== "production" && <DevToolsCard />}
    </div>
  );
}
