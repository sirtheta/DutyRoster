import pino from "pino";
import { config } from "@/lib/config";
import { zonedTimestamp } from "@/lib/date";
// APP_TIMEZONE falls back to UTC when the configured zone is unusable — an
// invalid timezone must not take the logger down with it, since without a
// logger there would be nowhere left to report the problem.
import { APP_TIMEZONE } from "@/lib/app-time";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Default pino timestamps are a raw epoch integer, which is unreadable in
  // `docker logs`. ISO-8601 in the app timezone (APP_TIMEZONE / TZ) is both
  // human-scannable and still greppable, and it matches what the audit view
  // and the rotated log filenames (app-<local date>.log) show — a UTC
  // timestamp inside app-2026-08-11.log would start the file at 22:00 of the
  // previous day.
  timestamp: () => `,"time":"${zonedTimestamp(new Date(), APP_TIMEZONE)}"`,
});

if (APP_TIMEZONE !== config.timezone) {
  logger.warn({ timezone: config.timezone }, "Invalid APP_TIMEZONE — falling back to UTC");
}

export default logger;
