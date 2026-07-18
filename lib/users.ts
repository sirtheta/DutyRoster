import type { Prisma } from "@prisma/client";

// Users who belong on a given year's roster: still active, or terminated
// partway through/after that year started. Kept apart from a plain
// `isActive: true` filter, which is for rotation/automation/login and
// anything not tied to a specific year — a user terminated mid-year must
// stay visible on that year's calendar, dashboard, and exports even though
// they're no longer eligible for new duties.
export function rosterForYearWhere(year: number): Prisma.UserWhereInput {
  return {
    OR: [{ isActive: true }, { exitDate: { gte: `${year}-01-01` } }],
  };
}
