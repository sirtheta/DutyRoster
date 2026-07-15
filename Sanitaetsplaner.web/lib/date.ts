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

const WEEKDAY_ABBR = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Two-letter German weekday abbreviation for a `YYYY-MM-DD` string. */
export function weekdayAbbr(str: string): string {
  return WEEKDAY_ABBR[weekday(str)];
}
