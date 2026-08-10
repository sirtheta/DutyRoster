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

/** Label with a native hover tooltip explaining what the config value below it does. */
function ConfigLabel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <dt
      className="text-muted-foreground underline decoration-dotted underline-offset-4 cursor-help"
      title={title}
    >
      {children}
    </dt>
  );
}

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
            <ConfigLabel title="Cron-Zeitplan des Prüf-Jobs: Wie oft geprüft wird, ob laut den pro Person hinterlegten Wochentag/Uhrzeit-Einstellungen eine Benachrichtigung fällig ist (NOTIFY_CRON_SCHEDULE). Läuft standardmässig alle 5 Minuten, damit die minutengenaue Einstellung pro Person getroffen werden kann.">
              Benachrichtigungen
            </ConfigLabel>
            <dd className="font-mono text-xs">{config.notifications.cronSchedule}</dd>
            <ConfigLabel title="Zeitzone, in der die pro Person hinterlegte Wochentag/Uhrzeit-Einstellung ausgewertet wird (NOTIFY_TIMEZONE) — unabhängig von der Serverzeit.">
              Zeitzone
            </ConfigLabel>
            <dd className="font-mono text-xs">{config.notifications.timezone}</dd>
            <ConfigLabel title="Wie oft eine fehlgeschlagene Zustellung automatisch wiederholt wird (NOTIFY_MAX_ATTEMPTS), bevor sie unter „Fehlgeschlagene Benachrichtigungen“ zur manuellen Wiederholung angezeigt wird.">
              Max. Zustellversuche
            </ConfigLabel>
            <dd className="font-mono text-xs">{config.notifications.maxAttempts}</dd>
            <ConfigLabel title="Wie lange versendete oder endgültig fehlgeschlagene Benachrichtigungs-Einträge in der Datenbank bleiben, bevor sie automatisch gelöscht werden (NOTIFY_RETENTION_DAYS). Betrifft nur die Historie, nicht ob/wann verschickt wird. 0 = unbegrenzt.">
              Benachrichtigungen aufbewahren
            </ConfigLabel>
            <dd className="font-mono text-xs">
              {config.notifications.retentionDays === 0
                ? "unbegrenzt"
                : `${config.notifications.retentionDays} Tage`}
            </dd>
            <ConfigLabel title="Cron-Zeitplan des nächtlichen Datenbank-Backups (BACKUP_CRON_SCHEDULE). Erstellt eine konsistente SQLite-Momentaufnahme im backups/-Ordner.">
              Backup
            </ConfigLabel>
            <dd className="font-mono text-xs">{config.backup.cronSchedule}</dd>
            <ConfigLabel title="Wie lange Backup-Dateien aufbewahrt werden, bevor ältere automatisch gelöscht werden (BACKUP_MAX_KEEP_DAYS). 0 = alle behalten.">
              Backups aufbewahren
            </ConfigLabel>
            <dd className="font-mono text-xs">
              {config.backup.maxKeepDays === 0 ? "alle" : `${config.backup.maxKeepDays} Tage`}
            </dd>
            <ConfigLabel title="Wie lange Einträge im Audit-Log aufbewahrt werden, bevor sie automatisch gelöscht werden (AUDIT_RETENTION_DAYS). 0 = unbegrenzt.">
              Audit-Log aufbewahren
            </ConfigLabel>
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
