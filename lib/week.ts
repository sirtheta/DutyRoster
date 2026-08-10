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

export interface UncoveredWeek {
  weekNumber: number;
  /** Monday of the week (YYYY-MM-DD). */
  start: string;
  /** Non-holiday workdays of the week that fall within [from, to]. */
  dates: string[];
}

/** A Mon–Fri calendar week, clipped to a queried range and with holidays removed. */
interface WorkWeek {
  /** Monday of the week (YYYY-MM-DD), even if it falls outside the range. */
  start: string;
  /** Non-holiday workdays of the week that fall within the range. */
  workDays: string[];
}

/** Splits [`from`, `to`] into its overlapping Mon–Fri calendar weeks. */
function workWeeksInRange(from: string, to: string, holidays: Set<string>): WorkWeek[] {
  const result: WorkWeek[] = [];
  let monday = weekRange(parseDate(from)!).start;
  while (monday <= to) {
    const days = [0, 1, 2, 3, 4]
      .map((i) => addDays(monday, i))
      .filter((d) => d >= from && d <= to);
    result.push({ start: monday, workDays: days.filter((d) => !holidays.has(d)) });
    monday = addDays(monday, 7);
  }
  return result;
}

/**
 * The Mon–Fri weeks overlapping [`from`, `to`] (inclusive, YYYY-MM-DD) that
 * have at least one non-holiday workday within that range but no S-duty on
 * any of them. A week's first/last days are clipped to the range, so a week
 * that starts or ends outside it (e.g. the year's first week starting in
 * December of the previous year) is only judged on the days inside it.
 */
export function uncoveredWeeksInRange(
  from: string,
  to: string,
  sDutyDates: Set<string>,
  holidays: Set<string>
): UncoveredWeek[] {
  const result: UncoveredWeek[] = [];
  for (const { start, workDays } of workWeeksInRange(from, to, holidays)) {
    if (workDays.length > 0 && !workDays.some((d) => sDutyDates.has(d))) {
      result.push({ weekNumber: isoWeekNumber(workDays[0]), start, dates: workDays });
    }
  }
  return result;
}

/**
 * Individual workdays within [`from`, `to`] that have no S-duty even though
 * their calendar week isn't reported by `uncoveredWeeksInRange` — i.e. the
 * week has duty on *some* days but a gap on others (e.g. a week split
 * between two colleagues that leaves one day uncovered, or a single S-entry
 * moved/deleted). Weeks with no duty at all are left to
 * `uncoveredWeeksInRange` so the two never double-report the same days.
 */
export function partiallyUncoveredDaysInRange(
  from: string,
  to: string,
  sDutyDates: Set<string>,
  holidays: Set<string>
): string[] {
  const result: string[] = [];
  for (const { workDays } of workWeeksInRange(from, to, holidays)) {
    const coveredCount = workDays.filter((d) => sDutyDates.has(d)).length;
    if (coveredCount > 0 && coveredCount < workDays.length) {
      result.push(...workDays.filter((d) => !sDutyDates.has(d)));
    }
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
