import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireEditor } from "@/lib/permissions";
import { datesOfYear } from "@/lib/date";
import { TYPE_INFO } from "@/lib/entry-types";

export async function GET(request: NextRequest, { params }: { params: Promise<{ year: string }> }) {
  await requireEditor();
  const { year: yearParam } = await params;
  const year = parseInt(yearParam, 10);
  if (!Number.isInteger(year)) {
    return NextResponse.json({ error: "Ungültiges Jahr" }, { status: 400 });
  }

  const [users, entries, holidays] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, orderBy: { rotationOrder: "asc" } }),
    prisma.entry.findMany({ where: { date: { startsWith: `${year}-` } } }),
    prisma.holiday.findMany({ where: { year }, select: { date: true } }),
  ]);

  const holidaySet = new Set(holidays.map((h) => h.date));
  const entryMap = new Map(entries.map((e) => [`${e.userId}-${e.date}`, e]));
  const dates = datesOfYear(year);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`${year}`);

  sheet.getColumn(1).width = 22;
  const headerRow = sheet.getRow(1);
  headerRow.getCell(1).value = "Name";
  dates.forEach((d, i) => {
    const cell = headerRow.getCell(i + 2);
    cell.value = parseInt(d.slice(8, 10), 10);
    if (holidaySet.has(d)) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    }
    sheet.getColumn(i + 2).width = 3;
  });

  users.forEach((u, rowIndex) => {
    const row = sheet.getRow(rowIndex + 2);
    row.getCell(1).value = u.name;
    dates.forEach((d, colIndex) => {
      const entry = entryMap.get(`${u.id}-${d}`);
      const cell = row.getCell(colIndex + 2);
      if (entry) {
        cell.value = entry.type;
        const hex = TYPE_INFO[entry.type].color.replace("#", "");
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex.toUpperCase()}` } };
        cell.font = { color: { argb: entry.type === "H" ? "FFFFFFFF" : "FF000000" } };
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sanitaetsplaner-${year}.xlsx"`,
    },
  });
}
