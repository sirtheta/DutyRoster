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
 * Weekday (0=So … 6=Sa), hour (0–23), minute (0–59), and calendar day
 * (`YYYY-MM-DD`) of a moment as seen in an IANA timezone — independent of
 * the server's own TZ.
 */
export function zonedParts(
  date: Date,
  timeZone: string
): { weekday: number; hour: number; minute: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/**
 * Formatters are comparatively expensive to construct and these run on every
 * log line, so keep one per timezone.
 */
const timestampFormatters = new Map<string, Intl.DateTimeFormat>();

function timestampFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = timestampFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
      timeZoneName: "longOffset",
    });
    timestampFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * A moment as an ISO-8601 timestamp in `timeZone`, with the zone's UTC offset
 * kept (`2026-08-11T14:23:45.123+02:00`). The offset is what makes this safe
 * to write into log files: local time alone is ambiguous across the DST
 * change, when the same wall-clock hour occurs twice.
 */
export function zonedTimestamp(date: Date, timeZone: string): string {
  const parts = timestampFormatter(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  // "longOffset" renders UTC itself as a bare "GMT", everything else as
  // "GMT+02:00".
  const offset = get("timeZoneName").replace("GMT", "") || "+00:00";
  return (
    `${get("year")}-${get("month")}-${get("day")}` +
    `T${get("hour")}:${get("minute")}:${get("second")}.${get("fractionalSecond")}${offset}`
  );
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** How far `timeZone` is ahead of UTC at a given instant, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  // Sub-second precision is irrelevant here and formatToParts drops it, so
  // compare against a whole second of the instant.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which the calendar day `YYYY-MM-DD` begins in `timeZone` —
 * i.e. what a DB query has to compare a UTC-stored timestamp against to mean
 * "from local midnight onwards".
 */
export function zonedDayStart(dateStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const asIfUtc = Date.UTC(y, m - 1, d);
  // The offset has to be read at the resulting instant, not at the UTC guess:
  // near a DST switch the two can differ by an hour. One correction pass
  // settles it, since the guess is at most an hour off.
  const firstGuess = asIfUtc - zoneOffsetMs(new Date(asIfUtc), timeZone);
  return new Date(asIfUtc - zoneOffsetMs(new Date(firstGuess), timeZone));
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
