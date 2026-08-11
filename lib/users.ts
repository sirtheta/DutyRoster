import type { Prisma } from "@prisma/client";
import { todayString } from "@/lib/app-time";

// Users who belong on a given year's roster: still active, or terminated
// partway through/after that year started. Kept apart from a plain
// `isActive: true` filter, which is for rotation/automation and anything not
// tied to a specific year — a user terminated mid-year must stay visible on
// that year's calendar, dashboard, and exports even though they're no longer
// eligible for new duties.
export function rosterForYearWhere(year: number): Prisma.UserWhereInput {
  return {
    OR: [{ isActive: true }, { exitDate: { gte: `${year}-01-01` } }],
  };
}

// Login access, which outlives `isActive`: termination keeps the user's duties
// up to and including their exit date, so they must be able to sign in until
// then to see their remaining S-Dienste and hand them over. The date compare is
// a plain string compare — both sides are `YYYY-MM-DD` local calendar days —
// and needs no cron job: access lapses by itself the day after the exit date.
// A user deactivated without an exit date (`toggleActiveAction`) is locked out
// immediately.
export function canSignIn(user: { isActive: boolean; exitDate: string | null }): boolean {
  return user.isActive || (user.exitDate !== null && user.exitDate >= todayString());
}
