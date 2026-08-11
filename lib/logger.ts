import pino from "pino";
import { config } from "@/lib/config";
import { isValidTimeZone, zonedTimestamp } from "@/lib/date";

// An unusable timezone must not take the logger down with it — without a
// logger there would be nowhere to report the problem either.
const timeZone = isValidTimeZone(config.timezone) ? config.timezone : "UTC";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Default pino timestamps are a raw epoch integer, which is unreadable in
  // `docker logs`. ISO-8601 in the app timezone (APP_TIMEZONE / TZ) is both
  // human-scannable and still greppable, and it matches what the audit view
  // and the rotated log filenames (app-<local date>.log) show — a UTC
  // timestamp inside app-2026-08-11.log would start the file at 22:00 of the
  // previous day.
  timestamp: () => `,"time":"${zonedTimestamp(new Date(), timeZone)}"`,
});

if (!isValidTimeZone(config.timezone)) {
  logger.warn({ timezone: config.timezone }, "Invalid APP_TIMEZONE — logging timestamps in UTC");
}

export default logger;
