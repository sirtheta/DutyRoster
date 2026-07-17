import { toDateString, addDays, weekday, parseDate } from "@/lib/date";

/** Monday..Sunday range (YYYY-MM-DD, inclusive) of the week containing `date`. */
export function weekRange(date: Date): { start: string; end: string } {
  const today = toDateString(date);
  const dow = weekday(today); // 0=So ... 6=Sa
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const start = addDays(today, -daysSinceMonday);
  const end = addDays(start, 6);
  return { start, end };
}

/**
 * ISO week numbers (KW) of the Mon–Fri weeks from `fromDate`'s week to the
 * end of its year that have at least one non-holiday workday but no S-duty.
 */
export function uncoveredWeekNumbers(
  fromDate: string,
  sDutyDates: Set<string>,
  holidays: Set<string>
): number[] {
  const year = fromDate.slice(0, 4);
  const result: number[] = [];
  let monday = weekRange(parseDate(fromDate)!).start;
  while (monday.slice(0, 4) <= year) {
    const days = [0, 1, 2, 3, 4]
      .map((i) => addDays(monday, i))
      .filter((d) => d.slice(0, 4) === year);
    const workDays = days.filter((d) => !holidays.has(d));
    if (workDays.length > 0 && !workDays.some((d) => sDutyDates.has(d))) {
      result.push(isoWeekNumber(workDays[0]));
    }
    monday = addDays(monday, 7);
  }
  return result;
}

/** ISO 8601 week number (KW) of a `YYYY-MM-DD` string. */
export function isoWeekNumber(dateStr: string): number {
  const d = parseDate(dateStr)!;
  // The Thursday of a week determines its ISO week-year.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}
