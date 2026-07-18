import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireEditor } from "@/lib/permissions";
import { rosterForYearWhere } from "@/lib/users";
import { datesOfYear, weekdayAbbr, isWeekend } from "@/lib/date";
import { TYPE_INFO } from "@/lib/entry-types";

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const NAME_COLUMN_WIDTH = 22;
const DAY_COLUMN_WIDTH = 3;

export async function GET(request: NextRequest, { params }: { params: Promise<{ year: string }> }) {
  await requireEditor();
  const { year: yearParam } = await params;
  const year = parseInt(yearParam, 10);
  if (!Number.isInteger(year)) {
    return NextResponse.json({ error: "Ungültiges Jahr" }, { status: 400 });
  }

  const [users, entries, holidays] = await Promise.all([
    prisma.user.findMany({ where: rosterForYearWhere(year), orderBy: { rotationOrder: "asc" } }),
    prisma.entry.findMany({ where: { date: { startsWith: `${year}-` } } }),
    prisma.holiday.findMany({ where: { year }, select: { date: true } }),
  ]);

  const holidaySet = new Set(holidays.map((h) => h.date));
  const entryMap = new Map(entries.map((e) => [`${e.userId}-${e.date}`, e]));
  const dates = datesOfYear(year);
  const months = Array.from({ length: 12 }, (_, m) => dates.filter((d) => parseInt(d.slice(5, 7), 10) === m + 1));
  const maxDaysInMonth = Math.max(...months.map((m) => m.length));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`${year}`);
  sheet.views = [{ state: "frozen", ySplit: 0, xSplit: 1 }];

  sheet.getColumn(1).width = NAME_COLUMN_WIDTH;
  for (let i = 0; i < maxDaysInMonth; i++) {
    sheet.getColumn(i + 2).width = DAY_COLUMN_WIDTH;
  }

  let currentRow = 1;
  months.forEach((monthDates) => {
    const titleRow = sheet.getRow(currentRow);
    titleRow.getCell(1).value = `${MONTH_NAMES[parseInt(monthDates[0].slice(5, 7), 10) - 1]} ${year}`;
    titleRow.getCell(1).font = { bold: true };
    sheet.mergeCells(currentRow, 1, currentRow, monthDates.length + 1);
    currentRow++;

    const weekdayRow = sheet.getRow(currentRow);
    const dayRow = sheet.getRow(currentRow + 1);
    weekdayRow.getCell(1).value = "Name";
    weekdayRow.getCell(1).font = { bold: true };
    monthDates.forEach((d, i) => {
      const weekdayCell = weekdayRow.getCell(i + 2);
      const dayCell = dayRow.getCell(i + 2);
      weekdayCell.value = weekdayAbbr(d);
      weekdayCell.font = { size: 8, italic: true };
      dayCell.value = parseInt(d.slice(8, 10), 10);
      dayCell.font = { bold: true };
      if (holidaySet.has(d) || isWeekend(d)) {
        const fill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
        weekdayCell.fill = fill;
        dayCell.fill = fill;
      }
    });
    currentRow += 2;

    users.forEach((u) => {
      const row = sheet.getRow(currentRow);
      row.getCell(1).value = u.name;
      monthDates.forEach((d, colIndex) => {
        const entry = entryMap.get(`${u.id}-${d}`);
        const cell = row.getCell(colIndex + 2);
        if (entry) {
          cell.value = entry.type;
          const hex = TYPE_INFO[entry.type].color.replace("#", "");
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${hex.toUpperCase()}` } };
          cell.font = { color: { argb: entry.type === "H" ? "FFFFFFFF" : "FF000000" } };
        }
      });
      currentRow++;
    });

    currentRow += 1; // spacer row between months
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="DutyRoster-${year}.xlsx"`,
    },
  });
}
