/**
 * Local-time date helpers for `YYYY-MM-DD` form values.
 *
 * These intentionally avoid `new Date("YYYY-MM-DD")` (parsed as UTC midnight)
 * and `Date.toISOString()` (UTC), which shift the calendar day for users in
 * non-UTC timezones. All parsing and formatting happens in local time.
 */

/** Parse a `YYYY-MM-DD` string into a local-time Date (midnight). */
export function parseDate(str: string | undefined): Date | undefined {
  if (!str) return undefined;
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

/** Format a Date into a `YYYY-MM-DD` string using its local calendar day. */
export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Format a `YYYY-MM-DD` string as Swiss-standard `DD.MM.YYYY`. */
export function formatDateCH(str: string): string {
  const [y, m, d] = str.split("-");
  return `${d}.${m}.${y}`;
}

/** Add `days` to a `YYYY-MM-DD` string, returning a `YYYY-MM-DD` string. */
export function addDays(str: string, days: number): string {
  const d = parseDate(str);
  if (!d) return str;
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** All `YYYY-MM-DD` calendar days of a given year, in order. */
export function datesOfYear(year: number): string[] {
  const dates: string[] = [];
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    dates.push(toDateString(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/** 0=Sonntag ... 6=Samstag, for a `YYYY-MM-DD` string. */
export function weekday(str: string): number {
  return parseDate(str)!.getDay();
}

export function isWeekend(str: string): boolean {
  const w = weekday(str);
  return w === 0 || w === 6;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Weekday (0=So … 6=Sa), hour (0–23), and calendar day (`YYYY-MM-DD`) of a
 * moment as seen in an IANA timezone — independent of the server's own TZ.
 */
export function zonedParts(
  date: Date,
  timeZone: string
): { weekday: number; hour: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    hour: parseInt(get("hour"), 10),
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const WEEKDAY_ABBR = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Two-letter German weekday abbreviation for a `YYYY-MM-DD` string. */
export function weekdayAbbr(str: string): string {
  return WEEKDAY_ABBR[weekday(str)];
}
