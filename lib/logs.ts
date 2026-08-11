import cron from "node-cron";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  truncateSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import logger from "@/lib/logger";
import { config } from "@/lib/config";
import { isValidTimeZone, zonedParts } from "@/lib/date";
import { LOG_DIR } from "@/lib/log-capture";

// Only the path constants are re-exported. `startLogCapture` and `tee`
// deliberately are not: importing this module constructs the shared pino
// logger (see `log` below), and pino locks its destination in at that moment
// — so anyone reaching startLogCapture *through here* would build the logger
// before patching the streams and silently get an empty app.log again, which
// is exactly the bug lib/log-capture.ts was split out to prevent. Import it
// from "@/lib/log-capture" directly.
export { LOG_DIR, LOG_FILE } from "@/lib/log-capture";

const log = logger.child({ module: "logs" });

const globalForScheduler = globalThis as unknown as {
  logRotationSchedulerStarted?: boolean;
};

const ROTATED_LOG_RE = /^app-(\d{4}-\d{2}-\d{2})\.log$/;

// Rotated filenames name a calendar day, so they have to agree with the
// timezone the timestamps inside the file are written in (lib/logger) — read
// from the app timezone rather than the server's own TZ.
const TZ = isValidTimeZone(config.timezone) ? config.timezone : "UTC";

/** The `YYYY-MM-DD` calendar day a moment falls on, in the app timezone. */
function localDay(date: Date): string {
  return zonedParts(date, TZ).date;
}

export interface LogFileInfo {
  /** Filename only, safe to use as a URL path segment. */
  name: string;
  sizeBytes: number;
  /** `true` for the still-open app.log that the running process is writing to. */
  current: boolean;
  /** Calendar day the entries in this file belong to. */
  date: string;
}

/** Lists exportable log files: the current file first, then rotated ones newest first. */
export function listLogFiles(dir: string = LOG_DIR): LogFileInfo[] {
  if (!existsSync(dir)) return [];

  const files: LogFileInfo[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "app.log") {
      files.push({
        name,
        sizeBytes: statSync(join(dir, name)).size,
        current: true,
        date: localDay(new Date()),
      });
      continue;
    }
    const match = ROTATED_LOG_RE.exec(name);
    if (match) {
      files.push({
        name,
        sizeBytes: statSync(join(dir, name)).size,
        current: false,
        date: match[1],
      });
    }
  }

  return files.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return b.date.localeCompare(a.date);
  });
}

/**
 * Rotates the current log file to `app-<yesterday>.log` and prunes rotated
 * files older than the retention window. Returns the path written, or `null`
 * if there was nothing to rotate.
 *
 * Copy-then-truncate rather than rename: the file destination opened by
 * `startLogCapture` holds an open write stream in append mode, and a file
 * descriptor is bound to the inode, not the path — renaming the file out
 * from under it would silently keep new log lines flowing into the renamed
 * file instead of a fresh one. Truncating the still-open file resets the
 * append offset to zero, so writes right after this call land at the start
 * of an empty file, exactly like logrotate's `copytruncate`.
 *
 * Rotating twice on the same day (a restart plus the cron job, a manual
 * trigger) appends to the existing target instead of overwriting it, so the
 * second run can't discard what the first one already rotated out.
 */
export function rotateLogs(
  options: { dir?: string; maxKeepDays?: number; now?: Date } = {}
): string | null {
  const dir = options.dir ?? LOG_DIR;
  const now = options.now ?? new Date();
  const current = join(dir, "app.log");

  let target: string | null = null;
  if (existsSync(current) && statSync(current).size > 0) {
    // The file being rotated holds the day that just ended, not today.
    const rotatedDate = localDay(new Date(now.getTime() - 86_400_000));
    target = join(dir, `app-${rotatedDate}.log`);
    const appended = existsSync(target);
    if (appended) {
      // copyFileSync would replace the whole file and drop the earlier run's
      // lines. Read-then-append rather than a stream so the truncate below
      // still happens synchronously, with no window for new writes to land in
      // the file after it was read but before it was emptied.
      appendFileSync(target, readFileSync(current));
    } else {
      copyFileSync(current, target);
    }
    truncateSync(current, 0);
    log.info({ target, appended }, "Log file rotated");
  }

  pruneOldLogs(dir, options.maxKeepDays ?? config.logs.maxKeepDays, now);
  return target;
}

/** Deletes rotated log files older than `maxKeepDays` (0 = keep all). Returns the number deleted. */
export function pruneOldLogs(dir: string, maxKeepDays: number, now = new Date()): number {
  if (maxKeepDays <= 0 || !existsSync(dir)) return 0;
  const cutoff = localDay(new Date(now.getTime() - maxKeepDays * 86_400_000));
  let deleted = 0;
  for (const file of readdirSync(dir)) {
    const match = ROTATED_LOG_RE.exec(file);
    if (match && match[1] < cutoff) {
      unlinkSync(join(dir, file));
      deleted++;
    }
  }
  if (deleted > 0) log.info({ deleted, maxKeepDays }, "Pruned old log files");
  return deleted;
}

/** Starts the nightly log rotation cron job (LOG_ROTATE_CRON_SCHEDULE, app timezone). */
export function startLogRotationScheduler(): void {
  if (globalForScheduler.logRotationSchedulerStarted) return;
  if (process.env.DISABLE_LOG_ROTATION === "true") {
    log.info("Log rotation disabled (DISABLE_LOG_ROTATION=true)");
    return;
  }
  const schedule = config.logs.rotateCronSchedule;
  if (!cron.validate(schedule)) {
    log.error({ schedule }, "Invalid LOG_ROTATE_CRON_SCHEDULE — log rotation scheduler not started");
    return;
  }
  cron.schedule(
    schedule,
    () => {
      try {
        rotateLogs();
      } catch (err) {
        log.error({ err }, "Log rotation failed");
      }
    },
    // Runs in the app timezone, so "rotate at 02:35" means local night and the
    // file it closes off covers exactly the local day named in its filename.
    { timezone: TZ }
  );
  globalForScheduler.logRotationSchedulerStarted = true;
  log.info({ schedule, maxKeepDays: config.logs.maxKeepDays }, "Log rotation scheduler started");
}

/** Resolves a downloadable log file's absolute path, or `null` for anything outside the log dir. */
export function resolveLogFilePath(filename: string, dir: string = LOG_DIR): string | null {
  if (filename === "app.log") return join(dir, filename);
  if (ROTATED_LOG_RE.test(filename)) return join(dir, filename);
  return null;
}
