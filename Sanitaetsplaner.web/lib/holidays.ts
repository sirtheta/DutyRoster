import Holidays from "date-holidays";
import type { Holiday, PrismaClient } from "@prisma/client";
import defaultPrisma from "@/lib/prisma";
import { addDays, toDateString } from "@/lib/date";

/**
 * Imports the statutory holidays of a canton for a year from `date-holidays`
 * into the DB. Holidays already present (same date + canton) are skipped so
 * manual adjustments are preserved.
 */
export async function importHolidaysForYear(
  year: number,
  canton: string,
  prisma: PrismaClient = defaultPrisma
): Promise<number> {
  const hd = new Holidays("CH", canton);
  const holidays = hd.getHolidays(year).filter((h) => h.type === "public");

  let imported = 0;
  for (const h of holidays) {
    const date = toDateString(new Date(h.date));
    try {
      await prisma.holiday.create({
        data: { date, name: h.name, canton, year },
      });
      imported++;
    } catch {
      // unique constraint (date, canton) — already imported, skip
    }
  }
  return imported;
}

/** All holidays of a year as a Set of YYYY-MM-DD strings (across cantons). */
export async function holidaySetForYear(
  year: number,
  prisma: PrismaClient = defaultPrisma
): Promise<Set<string>> {
  const rows = await prisma.holiday.findMany({ where: { year }, select: { date: true } });
  return new Set(rows.map((r) => r.date));
}

export type HolidayGroup = {
  ids: number[];
  from: string;
  to: string;
  name: string;
  canton: string | null;
};

/**
 * Merges consecutive-day holidays with the same name/canton (e.g. a
 * multi-day "Betriebsferien" range or a block of school holidays) into a
 * single group, so the list view can show one range instead of one row per day.
 * Assumes `holidays` is sorted by date ascending.
 */
export function groupConsecutiveHolidays(holidays: Holiday[]): HolidayGroup[] {
  const groups: HolidayGroup[] = [];
  for (const h of holidays) {
    const last = groups[groups.length - 1];
    if (last && last.name === h.name && last.canton === h.canton && addDays(last.to, 1) === h.date) {
      last.to = h.date;
      last.ids.push(h.id);
    } else {
      groups.push({ ids: [h.id], from: h.date, to: h.date, name: h.name, canton: h.canton });
    }
  }
  return groups;
}
