import prisma from "@/lib/prisma";
import { appOrigin } from "@/lib/origin";
import { requireSession } from "@/lib/permissions";
import { ENTRY_TYPES } from "@/lib/entry-types";
import { formatDateCH, parseDate, toDateString } from "@/lib/date";
import { isoWeekNumber, weekRange } from "@/lib/week";
import { DashboardChart } from "@/components/dashboard-chart";
import { IcalSubscribeCard } from "@/components/ical-subscribe-card";
import { SwapRequestsCard } from "@/components/swap-requests-card";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await requireSession();
  const userId = Number(session.user.id);
  const { year: yearParam } = await searchParams;
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const today = toDateString(new Date());

  const [users, entries, currentUser, upcomingDuties, pendingSwaps] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, orderBy: { rotationOrder: "asc" } }),
    prisma.entry.findMany({ where: { date: { startsWith: `${year}-` } } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { icalToken: true, icalIncludeVacation: true },
    }),
    prisma.entry.findMany({
      where: { userId, type: "S", date: { gte: today } },
      orderBy: { date: "asc" },
      take: 60,
    }),
    prisma.swapRequest.findMany({
      where: { status: "Pending", OR: [{ fromUserId: userId }, { toUserId: userId }] },
      include: { fromUser: { select: { name: true } }, toUser: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Own upcoming S-duties grouped into calendar weeks — the units offered for
  // swapping. Weeks already part of an open request are hidden.
  const weekGroups = new Map<string, string[]>();
  for (const e of upcomingDuties) {
    const { start } = weekRange(parseDate(e.date)!);
    if (!weekGroups.has(start)) weekGroups.set(start, []);
    weekGroups.get(start)!.push(e.date);
  }
  const requestedDates = new Set(
    pendingSwaps
      .filter((r) => r.fromUserId === userId)
      .flatMap((r) => JSON.parse(r.dates) as string[])
  );
  const myWeeks = [...weekGroups.entries()]
    .filter(([, dates]) => dates.every((d) => !requestedDates.has(d)))
    .map(([start, dates]) => ({
      key: start,
      label: `KW ${isoWeekNumber(dates[0])} (${formatDateCH(dates[0])} – ${formatDateCH(dates[dates.length - 1])})`,
      dates,
    }));

  const toSwapRow = (r: (typeof pendingSwaps)[number], otherName: string) => ({
    id: r.id,
    otherName,
    datesLabel: (JSON.parse(r.dates) as string[]).map(formatDateCH).join(", "),
    comment: r.comment,
  });
  const incoming = pendingSwaps
    .filter((r) => r.toUserId === userId)
    .map((r) => toSwapRow(r, r.fromUser.name));
  const outgoing = pendingSwaps
    .filter((r) => r.fromUserId === userId)
    .map((r) => toSwapRow(r, r.toUser.name));
  const colleagues = users
    .filter((u) => u.id !== userId)
    .map((u) => ({ id: u.id, name: u.name }));

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
      <SwapRequestsCard
        myWeeks={myWeeks}
        colleagues={colleagues}
        incoming={incoming}
        outgoing={outgoing}
      />
      <IcalSubscribeCard url={icalUrl} includeVacation={currentUser?.icalIncludeVacation ?? true} />
    </div>
  );
}
