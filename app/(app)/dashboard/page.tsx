import prisma from "@/lib/prisma";
import { appOrigin } from "@/lib/origin";
import { requireSession } from "@/lib/permissions";
import { ENTRY_TYPES } from "@/lib/entry-types";
import { DashboardChart } from "@/components/dashboard-chart";
import { IcalSubscribeCard } from "@/components/ical-subscribe-card";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await requireSession();
  const { year: yearParam } = await searchParams;
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  const [users, entries, currentUser] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, orderBy: { rotationOrder: "asc" } }),
    prisma.entry.findMany({ where: { date: { startsWith: `${year}-` } } }),
    prisma.user.findUnique({
      where: { id: Number(session.user.id) },
      select: { icalToken: true, icalIncludeVacation: true },
    }),
  ]);

  const data = users.map((u) => {
    const row: Record<string, string | number> = { name: u.name };
    for (const type of ENTRY_TYPES) row[type] = 0;
    for (const e of entries) {
      if (e.userId === u.id) row[e.type] = (row[e.type] as number) + 1;
    }
    return row;
  });

  const icalUrl = currentUser ? `${await appOrigin()}/api/ical/${currentUser.icalToken}` : "";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl">Dashboard {year}</h1>
      <DashboardChart data={data} year={year} />
      <IcalSubscribeCard url={icalUrl} includeVacation={currentUser?.icalIncludeVacation ?? true} />
    </div>
  );
}
