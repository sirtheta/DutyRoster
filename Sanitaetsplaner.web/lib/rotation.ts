import { datesOfYear } from "@/lib/date";

export interface RotationUser {
  userId: number;
  rotationOrder: number;
}

export interface RotationOptions {
  year: number;
  /** Active users participating in the rotation (order doesn't matter — sorted by rotationOrder). */
  users: RotationUser[];
  /** Number of consecutive days per user before the rotation moves to the next user. */
  blockSize: number;
  /** Holidays (YYYY-MM-DD) — block the automation entirely for all users on that day. */
  holidays: Set<string>;
  /**
   * Days on which a user already has an entry (F/G/M/A/... or manual) and is
   * therefore unavailable for the automation on that day. userId -> Set of YYYY-MM-DD.
   */
  blockedDates: Map<number, Set<string>>;
}

export interface RotationAssignment {
  date: string;
  userId: number;
}

/**
 * Pure rotation function for the yearly automation (S-duty).
 *
 * Walks the year in calendar-day order and assigns blocks of `blockSize`
 * consecutive days to users in turn. If the user currently up is blocked on a
 * given day (a holiday affects everyone, `blockedDates` affects only that
 * individual user), the rotation advances to the next user and the skipped
 * day does not count toward that user's next block.
 */
export function runRotation(options: RotationOptions): RotationAssignment[] {
  const { year, blockSize, holidays, blockedDates } = options;
  const users = [...options.users].sort((a, b) => a.rotationOrder - b.rotationOrder);
  if (users.length === 0 || blockSize < 1) return [];

  const assignments: RotationAssignment[] = [];
  const dates = datesOfYear(year);

  let userIndex = 0;
  let dayInBlock = 0;

  for (const date of dates) {
    if (holidays.has(date)) continue;

    for (let attempt = 0; attempt < users.length; attempt++) {
      const candidate = users[userIndex];
      const isBlocked = blockedDates.get(candidate.userId)?.has(date) ?? false;
      if (!isBlocked) {
        assignments.push({ date, userId: candidate.userId });
        dayInBlock++;
        if (dayInBlock >= blockSize) {
          dayInBlock = 0;
          userIndex = (userIndex + 1) % users.length;
        }
        break;
      }
      // This user is blocked on this day — move to the next user; the
      // skipped day restarts their block at 1.
      userIndex = (userIndex + 1) % users.length;
      dayInBlock = 0;
    }
    // If all users are blocked, the day stays unassigned; rotation state
    // (userIndex/dayInBlock) is unchanged for the next day.
  }

  return assignments;
}
