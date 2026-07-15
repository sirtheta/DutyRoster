import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { HolidayForm } from "@/components/holiday-form";
import { HolidayRangeForm } from "@/components/holiday-range-form";
import { HolidayImportForm } from "@/components/holiday-import-form";
import { HolidayDeleteButton } from "@/components/holiday-delete-button";
import { groupConsecutiveHolidays } from "@/lib/holidays";

export default async function HolidaysPage() {
  const session = await requireSession();
  const isAdmin = session.user.role === "Admin";
  const currentYear = new Date().getFullYear();

  const holidays = await prisma.holiday.findMany({
    where: { year: { gte: currentYear - 1, lte: currentYear + 1 } },
    orderBy: { date: "asc" },
  });
  const groups = groupConsecutiveHolidays(holidays);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl">Feiertage</h1>

      {isAdmin && (
        <div className="flex flex-wrap gap-4">
          <HolidayImportForm defaultYear={currentYear} />
          <HolidayForm />
          <HolidayRangeForm />
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Datum</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Kanton</TableHead>
            {isAdmin && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g) => (
            <TableRow key={g.ids[0]}>
              <TableCell>{g.from === g.to ? g.from : `${g.from} – ${g.to}`}</TableCell>
              <TableCell>{g.name}</TableCell>
              <TableCell>{g.canton ?? "—"}</TableCell>
              {isAdmin && (
                <TableCell className="text-right">
                  <HolidayDeleteButton id={g.ids.length === 1 ? g.ids[0] : g.ids} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
