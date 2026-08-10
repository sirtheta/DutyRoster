import type { AuditLog } from "@prisma/client";
import { formatDateCH } from "@/lib/date";
import { TYPE_INFO } from "@/lib/entry-types";
import type { EntryType } from "@prisma/client";

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Erstellt",
  UPDATE: "Geändert",
  DELETE: "Gelöscht",
  MOVE: "Verschoben",
  AUTOMATIC: "Automatisch generiert",
  SETTINGS: "Einstellungen geändert",
  TERMINATE: "Austritt erfasst",
};

const ENTITY_LABELS: Record<string, string> = {
  Entry: "Eintrag",
  Holiday: "Feiertag",
  User: "Benutzer",
  Settings: "Systemeinstellungen",
  SwapRequest: "Diensttausch",
};

// Klartext-Feldnamen für User-Updates, die als `changedFields` geloggt werden
// (siehe updateUserAction) — nie die alten/neuen Werte selbst, insbesondere
// beim Passwort.
const USER_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  email: "E-Mail",
  role: "Rolle",
  rotationOrder: "Rotationsreihenfolge",
  notifications: "Benachrichtigungseinstellungen",
  password: "Passwort",
};

// Klartext für Self-Service- und sonstige User-Aktionen, die nur als
// `{ action: "…" }` geloggt werden (statt als Feldänderung).
const USER_ACTION_LABELS: Record<string, string> = {
  passwordSetupEmailSent: "Passwort-Einladungslink erneut gesendet",
  regenerateIcalToken: "iCal-Token neu generiert",
  updateIcalIncludeVacation: "iCal-Feed-Einstellung geändert",
  changeOwnPassword: "Eigenes Passwort geändert",
  updateOwnNotificationSettings: "Eigene Benachrichtigungseinstellungen geändert",
  testNotification: "Test-Benachrichtigung gesendet",
  testUserNotification: "Test-Benachrichtigung gesendet",
  enableTwoFactor: "Zwei-Faktor-Authentifizierung aktiviert",
  disableTwoFactor: "Zwei-Faktor-Authentifizierung deaktiviert",
  regenerateBackupCodes: "Wiederherstellungscodes neu generiert",
};

const SETTINGS_ACTION_LABELS: Record<string, string> = {
  triggerNotificationCheck: "Benachrichtigungsprüfung manuell ausgelöst",
  retryFailedNotifications: "Fehlgeschlagene Benachrichtigungen erneut angestossen",
  downloadLog: "Logdatei heruntergeladen",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

/** Klartext für einen `{ action: "…", … }`-Detail-Payload auf einem User-Log. */
function describeUserAction(details: Record<string, unknown>): string {
  const action = details.action as string;
  const label = USER_ACTION_LABELS[action] ?? action;
  if (action === "passwordSetupEmailSent" && typeof details.email === "string") {
    return `${label} (${details.email})`;
  }
  if ((action === "testNotification" || action === "testUserNotification") && typeof details.channel === "string") {
    const channelLabel = details.channel === "Email" ? "E-Mail" : "Telegram";
    const target = typeof details.target === "string" ? ` an ${details.target}` : "";
    return `${label} (${channelLabel}${target})`;
  }
  if (action === "updateIcalIncludeVacation" && typeof details.includeVacation === "boolean") {
    return `${label}: Ferien ${details.includeVacation ? "eingeschlossen" : "ausgeschlossen"}`;
  }
  return label;
}

function typeLabel(type: string | null | undefined): string {
  if (!type) return "—";
  return TYPE_INFO[type as EntryType]?.label ?? type;
}

function userLabel(userNames: Map<number, string>, userId: number | undefined): string {
  if (userId === undefined) return "?";
  return userNames.get(userId) ?? `#${userId}`;
}

/** Human-readable (German) one-line description of an audit log's details. */
export function describeAuditLog(log: AuditLog, userNames: Map<number, string>): string {
  let details: Record<string, unknown> = {};
  try {
    details = log.details ? JSON.parse(log.details) : {};
  } catch {
    return log.details ?? "";
  }

  if (log.entityType === "Entry" && log.action === "MOVE") {
    if (details.bulk) {
      const moves = (details.moves as { fromUserId: number; fromDate: string; toUserId: number; toDate: string }[]) ?? [];
      return moves
        .map(
          (m) =>
            `${userLabel(userNames, m.fromUserId)} (${formatDateCH(m.fromDate)}) → ${userLabel(userNames, m.toUserId)} (${formatDateCH(m.toDate)})`
        )
        .join("; ");
    }
    const from = details.from as { userId: number; date: string } | undefined;
    const to = details.to as { userId: number; date: string } | undefined;
    if (from && to) {
      return `${userLabel(userNames, from.userId)} (${formatDateCH(from.date)}) → ${userLabel(userNames, to.userId)} (${formatDateCH(to.date)})`;
    }
  }

  if (log.entityType === "Entry" && (log.action === "CREATE" || log.action === "UPDATE" || log.action === "DELETE")) {
    if (details.bulk) {
      return `${details.count ?? "?"} Einträge → ${typeLabel(details.type as string | null)}`;
    }
    const userId = details.userId as number | undefined;
    const date = details.date as string | undefined;
    const before = details.before as string | null | undefined;
    const after = details.after as string | null | undefined;
    const who = userId !== undefined ? userLabel(userNames, userId) : undefined;
    const when = date ? formatDateCH(date) : undefined;
    const parts = [who, when].filter(Boolean).join(", ");
    if (log.action === "DELETE") return `${parts}: ${typeLabel(before)} entfernt`;
    if (before !== undefined && after !== undefined) return `${parts}: ${typeLabel(before)} → ${typeLabel(after)}`;
    return parts;
  }

  if (log.entityType === "Entry" && log.action === "AUTOMATIC") {
    return `Jahr ${details.year}: ${details.count} Dienste generiert`;
  }

  if (log.entityType === "User" && log.action === "TERMINATE") {
    const deleted = details.deletedEntries as number | undefined;
    return `Austrittsdatum ${formatDateCH(details.exitDate as string)}${deleted ? `, ${deleted} zukünftige Einträge entfernt` : ""}`;
  }

  if (log.entityType === "User") {
    if (Array.isArray(details.changedFields)) {
      const fields = details.changedFields as string[];
      if (fields.length === 0) return "Keine Änderungen";
      const parts = fields.map((f) => USER_FIELD_LABELS[f] ?? f).join(", ");
      const emailSuffix = fields.includes("email") && typeof details.email === "string" ? ` (${details.email})` : "";
      return `Geändert: ${parts}${emailSuffix}`;
    }
    if (typeof details.action === "string") return describeUserAction(details);
    if ("email" in details) return `E-Mail: ${details.email}`;
    if ("isActive" in details) return details.isActive ? "Aktiviert" : "Deaktiviert";
  }

  if (log.entityType === "Holiday") {
    if (details.from && details.to) return `${details.name} (${details.from} – ${details.to}, ${details.count}×)`;
    if (details.year) return `${details.year} (${details.canton}), ${details.count}×`;
    if (details.date) return `${details.name} (${formatDateCH(details.date as string)})`;
  }

  if (log.entityType === "SwapRequest") {
    if (log.action === "CREATE") {
      const toUserIds = (details.toUserIds as number[] | undefined) ?? [];
      const dates = (details.dates as string[] | undefined) ?? [];
      const targets = toUserIds.map((id) => userLabel(userNames, id)).join(", ");
      const broadcast = details.groupId ? " (an alle verfügbaren Kolleg:innen)" : "";
      return `Angeboten an ${targets}${broadcast}: ${dates.map(formatDateCH).join(", ")}`;
    }
    if (log.action === "MOVE" && details.action === "accept") {
      const dates = (details.dates as string[] | undefined) ?? [];
      return `${userLabel(userNames, details.toUserId as number)} übernimmt von ${userLabel(userNames, details.fromUserId as number)}: ${dates.map(formatDateCH).join(", ")}`;
    }
    if (log.action === "UPDATE" && details.action === "decline") return "Anfrage abgelehnt";
    if (log.action === "UPDATE" && details.action === "cancel") {
      return `Anfrage zurückgezogen${details.groupId ? " (Broadcast)" : ""}`;
    }
  }

  if (log.entityType === "Settings" && log.action === "SETTINGS") {
    if (details.action === "triggerNotificationCheck") {
      return `${SETTINGS_ACTION_LABELS.triggerNotificationCheck} (${details.queued} eingereiht)`;
    }
    if (details.action === "retryFailedNotifications") {
      return `${SETTINGS_ACTION_LABELS.retryFailedNotifications} (${details.count} wiederholt)`;
    }
    if (details.action === "downloadLog") {
      return `${SETTINGS_ACTION_LABELS.downloadLog} (${details.filename})`;
    }
    if (Object.keys(details).length === 0) return "SMTP-/Telegram-Einstellungen aktualisiert";
  }

  const keys = Object.keys(details);
  return keys.length ? JSON.stringify(details) : "—";
}
