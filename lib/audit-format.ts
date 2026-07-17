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
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
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
    if ("email" in details) return `E-Mail: ${details.email}`;
    if ("isActive" in details) return details.isActive ? "Aktiviert" : "Deaktiviert";
  }

  if (log.entityType === "Holiday") {
    if (details.from && details.to) return `${details.name} (${details.from} – ${details.to}, ${details.count}×)`;
    if (details.year) return `${details.year} (${details.canton}), ${details.count}×`;
    if (details.date) return `${details.name} (${formatDateCH(details.date as string)})`;
  }

  if (log.entityType === "Settings" && details.action === "triggerNotificationCheck") {
    return `Benachrichtigungsprüfung manuell ausgelöst (${details.queued} eingereiht)`;
  }

  const keys = Object.keys(details);
  return keys.length ? JSON.stringify(details) : "—";
}
