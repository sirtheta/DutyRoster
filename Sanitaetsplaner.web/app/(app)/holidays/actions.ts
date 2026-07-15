"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { importHolidaysForYear } from "@/lib/holidays";

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
  canton: z.string().optional(),
});

export async function createHolidayAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await requireAdmin();
  const parsed = holidaySchema.safeParse({
    date: formData.get("date"),
    name: formData.get("name"),
    canton: formData.get("canton") || undefined,
  });
  if (!parsed.success) return { error: "Ungültige Eingabe." };

  try {
    const holiday = await prisma.holiday.create({
      data: { ...parsed.data, year: parseInt(parsed.data.date.slice(0, 4), 10) },
    });
    await logAudit(session, "CREATE", "Holiday", holiday.id, parsed.data);
  } catch {
    return { error: "Dieser Feiertag existiert bereits für diesen Kanton." };
  }

  revalidatePath("/holidays");
  return {};
}

export async function deleteHolidayAction(id: number): Promise<void> {
  const session = await requireAdmin();
  await prisma.holiday.delete({ where: { id } });
  await logAudit(session, "DELETE", "Holiday", id);
  revalidatePath("/holidays");
}

export async function importHolidaysAction(year: number, canton: string): Promise<{ count: number }> {
  const session = await requireAdmin();
  const count = await importHolidaysForYear(year, canton);
  await logAudit(session, "CREATE", "Holiday", undefined, { year, canton, count });
  revalidatePath("/holidays");
  return { count };
}
