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

/**
 * Pure rotation function for the yearly automation (S-duty).
 *
 * Groups the year's working days into calendar weeks (Mon–Fri; weekends are
 * never scheduled) and hands each week to the next user in rotation order.
 * A week is skipped entirely (nobody assigned, rotation still advances to
 * the next user for the following week) if the assigned user is personally
 * blocked on any working day of it, or if some other user already has duty
 * that week. A week that is entirely holidays doesn't consume anyone's turn
 * at all — rotation stays on the same user for the next real week.
 */
export function runRotation(options: RotationOptions): RotationAssignment[] {
  const { year, holidays, blockedDates, occupiedDates } = options;
  const users = [...options.users].sort((a, b) => a.rotationOrder - b.rotationOrder);
  if (users.length === 0) return [];

  const assignments: RotationAssignment[] = [];
  const weeks = groupIntoWeeks(datesOfYear(year));

  let userIndex = 0;
  for (const week of weeks) {
    const workDays = week.filter((d) => !holidays.has(d));
    if (workDays.length === 0) continue; // fully-holiday week — nobody's turn is used

    const user = users[userIndex % users.length];
    const blocked = blockedDates.get(user.userId);
    const alreadyOccupied = workDays.some((d) => occupiedDates.has(d) || blocked?.has(d));
    if (!alreadyOccupied) {
      for (const d of workDays) assignments.push({ date: d, userId: user.userId });
    }
    userIndex++;
  }

  return assignments;
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
