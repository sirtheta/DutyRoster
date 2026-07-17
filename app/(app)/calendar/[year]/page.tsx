import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";
import { uncoveredWeeksInRange } from "@/lib/week";
import { CalendarGrid } from "@/components/calendar-grid";
import { AutomationPanel } from "@/components/automation-panel";
import { UncoveredWeeksBanner } from "@/components/uncovered-weeks-banner";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year: yearParam } = await params;
  const year = parseInt(yearParam, 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) notFound();

  const session = await requireSession();

  const [users, entries, holidays] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { rotationOrder: "asc" },
      select: { id: true, name: true, rotationOrder: true },
    }),
    prisma.entry.findMany({
      where: { date: { startsWith: `${year}-` } },
      select: { id: true, userId: true, date: true, type: true, source: true, comment: true },
    }),
    prisma.holiday.findMany({ where: { year }, select: { date: true, name: true } }),
  ]);

  const holidayNameByDate = new Map(holidays.map((h) => [h.date, h.name]));

  const sDutyDates = new Set(entries.filter((e) => e.type === "S").map((e) => e.date));
  const holidayDates = new Set(holidays.map((h) => h.date));
  const uncoveredWeeks = uncoveredWeeksInRange(
    `${year}-01-01`,
    `${year}-12-31`,
    sDutyDates,
    holidayDates
  );
  const uncoveredDates = new Set(uncoveredWeeks.flatMap((w) => w.dates));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild>
            <Link href={`/calendar/${year - 1}`} aria-label="Vorheriges Jahr">
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-xl">Kalender {year}</h1>
          <Button variant="outline" size="icon" asChild>
            <Link href={`/calendar/${year + 1}`} aria-label="Nächstes Jahr">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/plan/${year}/export`}>Excel-Export</a>
        </Button>
      </div>

      {session.user.role === "Admin" && <AutomationPanel year={year} />}

      <UncoveredWeeksBanner weekNumbers={uncoveredWeeks.map((w) => w.weekNumber)} />

      <CalendarGrid
        year={year}
        users={users}
        entries={entries}
        holidayNameByDate={Object.fromEntries(holidayNameByDate)}
        uncoveredDates={uncoveredDates}
        currentUserId={Number(session.user.id)}
        role={session.user.role}
      />
    </div>
  );
}
