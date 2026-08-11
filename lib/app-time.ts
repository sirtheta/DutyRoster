import { config } from "@/lib/config";
import { isValidTimeZone, zonedParts, zonedDayStart } from "@/lib/date";

/**
 * "Now" as the app sees it — the timezone the UI displays, logs, and decides
 * calendar days in (APP_TIMEZONE, falling back to the server's TZ and then
 * Europe/Zurich).
 *
 * The server's own clock is deliberately not trusted for this: a container
 * without TZ runs on UTC, where the Swiss day starts an hour or two before
 * midnight local — long enough for "today", "this week" and "the current
 * year" to be off for anyone using the app late in the evening.
 *
 * This module must not import lib/logger: lib/logger reads APP_TIMEZONE from
 * here, and a cycle between the two would leave the logger half-built at the
 * moment log-capture is still trying to set itself up first.
 */
export const APP_TIMEZONE = isValidTimeZone(config.timezone) ? config.timezone : "UTC";

/** The `YYYY-MM-DD` calendar day a moment falls on, in the app timezone. */
export function dayOf(date: Date): string {
  return zonedParts(date, APP_TIMEZONE).date;
}

/** Today's `YYYY-MM-DD` calendar day in the app timezone. */
export function todayString(now: Date = new Date()): string {
  return dayOf(now);
}

/** The calendar year a moment falls in, in the app timezone. */
export function yearOf(date: Date): number {
  return parseInt(dayOf(date).slice(0, 4), 10);
}

/** The calendar year currently running in the app timezone. */
export function currentYear(now: Date = new Date()): number {
  return yearOf(now);
}

/**
 * The instant a `YYYY-MM-DD` day begins in the app timezone — what a query
 * filtering UTC-stored timestamps by local day has to compare against.
 */
export function appDayStart(dateStr: string): Date {
  return zonedDayStart(dateStr, APP_TIMEZONE);
}

/** A stored timestamp as Swiss-formatted local date and time, e.g. `11.08.26, 14:23:45`. */
export function formatDateTime(date: Date): string {
  return date.toLocaleString("de-CH", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: APP_TIMEZONE,
  });
}
