/** Parse an integer env value; falls back when unset/malformed (0 is a valid value). */
function envInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  session: {
    maxAgeSec: parseInt(process.env.SESSION_MAX_AGE_SEC ?? "") || 7 * 24 * 60 * 60,
    updateAgeSec: parseInt(process.env.SESSION_UPDATE_AGE_SEC ?? "") || 24 * 60 * 60,
  },
  rateLimit: {
    maxAttempts: parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS ?? "") || 5,
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "") || 15 * 60 * 1000,
  },
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS ?? "") || 10,
  },
  notifications: {
    cronSchedule: process.env.NOTIFY_CRON_SCHEDULE || "0 * * * *",
    // IANA timezone the users' notifyWeekday/notifyHour refer to. Evaluated
    // via Intl, so it works regardless of the server's own TZ setting.
    timezone: process.env.NOTIFY_TIMEZONE || "Europe/Zurich",
    // How often a failing notification is retried before it's given up on.
    maxAttempts: envInt(process.env.NOTIFY_MAX_ATTEMPTS, 3),
    // Days to keep PendingNotification rows (sent or failed); 0 disables pruning.
    retentionDays: envInt(process.env.NOTIFY_RETENTION_DAYS, 90),
  },
  audit: {
    // Days to keep AuditLog rows; 0 disables pruning (keep forever).
    retentionDays: envInt(process.env.AUDIT_RETENTION_DAYS, 365),
  },
  backup: {
    // Nightly SQLite backup (VACUUM INTO <data>/backups). Runs in server time.
    cronSchedule: process.env.BACKUP_CRON_SCHEDULE || "30 2 * * *",
    // Days to keep backup files; 0 disables pruning (keep all).
    maxKeepDays: envInt(process.env.BACKUP_MAX_KEEP_DAYS, 14),
  },
  holidays: {
    defaultCanton: process.env.DEFAULT_CANTON || "BE",
  },
} as const;
