import { datesOfYear, isWeekend, parseDate } from "@/lib/date";
import { weekRange } from "@/lib/week";

export interface RotationUser {
  userId: number;
  rotationOrder: number;
}

export interface RotationOptions {
  year: number;
  /** Active users participating in the rotation (order doesn't matter — sorted by rotationOrder). */
  users: RotationUser[];
  /** Holidays (YYYY-MM-DD) — no duty is scheduled on these days. */
  holidays: Set<string>;
  /**
   * Days on which a given user already has an entry (any type — their own
   * duty or absence) and is therefore personally unavailable.
   * userId -> Set of YYYY-MM-DD.
   */
  blockedDates: Map<number, Set<string>>;
  /**
   * Days that already have an S-duty entry for *some* user — the week is
   * already covered, regardless of who the rotation would otherwise assign.
   */
  occupiedDates: Set<string>;
}

export interface RotationAssignment {
  date: string;
  userId: number;
}

export interface RotationResult {
  assignments: RotationAssignment[];
  /** First workday (YYYY-MM-DD) of each week that nobody could cover. */
  uncoveredWeeks: string[];
}

/**
 * Pure rotation function for the yearly automation (S-duty).
 *
 * Groups the year's working days into calendar weeks (Mon–Fri; weekends are
 * never scheduled) and hands each week to the next user in a rotation queue.
 * If the user at the front of the queue is personally blocked that week, the
 * next available user takes the week instead — the blocked user keeps their
 * place at the front and gets the following week, so nobody loses a turn and
 * no week goes uncovered just because one person is away. Only when every
 * user is blocked is the week reported as uncovered.
 *
 * A week some other user already has duty in (occupied) is skipped without
 * consuming anyone's turn, as is a week that is entirely holidays.
 */
export function runRotation(options: RotationOptions): RotationResult {
  const { year, holidays, blockedDates, occupiedDates } = options;
  const queue = [...options.users].sort((a, b) => a.rotationOrder - b.rotationOrder);
  if (queue.length === 0) return { assignments: [], uncoveredWeeks: [] };

  const assignments: RotationAssignment[] = [];
  const uncoveredWeeks: string[] = [];
  const weeks = groupIntoWeeks(datesOfYear(year));

  for (const week of weeks) {
    const workDays = week.filter((d) => !holidays.has(d));
    if (workDays.length === 0) continue; // fully-holiday week — nobody's turn is used
    if (workDays.some((d) => occupiedDates.has(d))) continue; // already covered manually

    const index = queue.findIndex((u) => {
      const blocked = blockedDates.get(u.userId);
      return !workDays.some((d) => blocked?.has(d));
    });
    if (index === -1) {
      uncoveredWeeks.push(workDays[0]);
      continue;
    }

    const [user] = queue.splice(index, 1);
    queue.push(user);
    for (const d of workDays) assignments.push({ date: d, userId: user.userId });
  }

  return { assignments, uncoveredWeeks };
}

/** Groups a year's weekday dates into chronological Mon–Fri calendar weeks. */
function groupIntoWeeks(dates: string[]): string[][] {
  const weeksByStart = new Map<string, string[]>();
  for (const d of dates) {
    if (isWeekend(d)) continue;
    const { start } = weekRange(parseDate(d)!);
    if (!weeksByStart.has(start)) weeksByStart.set(start, []);
    weeksByStart.get(start)!.push(d);
  }
  return [...weeksByStart.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, days]) => days);
}
