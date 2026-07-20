"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { importHolidaysForYear } from "@/lib/holidays";
import { addDays } from "@/lib/date";
import logger from "@/lib/logger";

const log = logger.child({ module: "holidays" });

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
});

export async function createHolidayAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await requireAdmin();
  const parsed = holidaySchema.safeParse({
    date: formData.get("date"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { error: "Ungültige Eingabe." };

  try {
    const holiday = await prisma.holiday.create({
      data: { ...parsed.data, year: parseInt(parsed.data.date.slice(0, 4), 10) },
    });
    await logAudit(session, "CREATE", "Holiday", holiday.id, parsed.data);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Dieser Feiertag existiert bereits." };
    }
    log.error({ err }, "Failed to create holiday");
    return { error: "Feiertag konnte nicht erstellt werden." };
  }

  revalidatePath("/holidays");
  return {};
}

const holidayRangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    name: z.string().min(1),
  })
  .refine((v) => v.from <= v.to, { message: "Von-Datum muss vor oder gleich Bis-Datum sein." });

export async function createHolidayRangeAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await requireAdmin();
  const parsed = holidayRangeSchema.safeParse({
    from: formData.get("from"),
    to: formData.get("to"),
    name: formData.get("name") || "Betriebsferien",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };

  const { from, to, name } = parsed.data;
  let count = 0;
  let date = from;
  while (date <= to) {
    try {
      await prisma.holiday.create({
        data: { date, name, year: parseInt(date.slice(0, 4), 10) },
      });
      count++;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
        // Not the expected "already a holiday on this day" case — don't
        // silently under-report the range, surface it instead of continuing.
        log.error({ err, date }, "Failed to create holiday in range");
        return { error: "Feiertage konnten nicht vollständig erstellt werden." };
      }
    }
    date = addDays(date, 1);
  }

  await logAudit(session, "CREATE", "Holiday", undefined, { from, to, name, count });
  revalidatePath("/holidays");
  return {};
}

export async function deleteHolidayAction(id: number): Promise<void> {
  const session = await requireAdmin();
  await prisma.holiday.delete({ where: { id } });
  await logAudit(session, "DELETE", "Holiday", id);
  revalidatePath("/holidays");
}

export async function deleteHolidaysAction(ids: number[]): Promise<void> {
  const session = await requireAdmin();
  await prisma.holiday.deleteMany({ where: { id: { in: ids } } });
  for (const id of ids) {
    await logAudit(session, "DELETE", "Holiday", id);
  }
  revalidatePath("/holidays");
}

export async function importHolidaysAction(rawYear: number, rawCanton: string): Promise<{ count: number }> {
  const session = await requireAdmin();
  const year = z.number().int().min(2000).max(2100).parse(rawYear);
  const canton = z.string().regex(/^[A-Z]{2}$/, "Ungültiger Kanton.").parse(rawCanton);
  const count = await importHolidaysForYear(year, canton);
  await logAudit(session, "CREATE", "Holiday", undefined, { year, canton, count });
  revalidatePath("/holidays");
  return { count };
}
