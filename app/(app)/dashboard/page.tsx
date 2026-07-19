import prisma from "@/lib/prisma";
import { appOrigin } from "@/lib/origin";
import { requireSession } from "@/lib/permissions";
import { rosterForYearWhere } from "@/lib/users";
import { ENTRY_TYPES } from "@/lib/entry-types";
import { formatDateCH, parseDate, toDateString } from "@/lib/date";
import { addDays } from "@/lib/date";
import { isoWeekNumber, uncoveredWeeksInRange, weekRange } from "@/lib/week";
import { holidaySetForYear } from "@/lib/holidays";
import { DashboardChart } from "@/components/dashboard-chart";
import { DutyOverviewCard } from "@/components/duty-overview-card";
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
  const now = new Date();
  const today = toDateString(now);
  const currentYear = today.slice(0, 4);
  const thisWeek = weekRange(now);
  const nextWeek = weekRange(parseDate(addDays(thisWeek.start, 7))!);

  const [activeUsers, yearUsers, entries, currentUser, upcomingDuties, pendingSwaps, dutyEntries, yearDuties, holidays] =
    await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, orderBy: { rotationOrder: "asc" } }),
    // Includes users terminated partway through the viewed year, so the
    // per-employee chart still accounts for their history that year — unlike
    // activeUsers above, which is for swap colleagues and must stay current.
    prisma.user.findMany({ where: rosterForYearWhere(year), orderBy: { rotationOrder: "asc" } }),
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
    prisma.entry.findMany({
      where: { type: "S", date: { gte: thisWeek.start, lte: nextWeek.end } },
      include: { user: { select: { name: true } } },
    }),
    prisma.entry.findMany({
      where: { type: "S", date: { startsWith: `${currentYear}-` } },
      select: { date: true },
    }),
    holidaySetForYear(Number(currentYear)),
  ]);

  const namesInRange = (start: string, end: string) => [
    ...new Set(dutyEntries.filter((e) => e.date >= start && e.date <= end).map((e) => e.user.name)),
  ];
  const dutyThisWeek = { weekNumber: isoWeekNumber(thisWeek.start), names: namesInRange(thisWeek.start, thisWeek.end) };
  const dutyNextWeek = { weekNumber: isoWeekNumber(nextWeek.start), names: namesInRange(nextWeek.start, nextWeek.end) };
  const uncovered = uncoveredWeeksInRange(
    today,
    `${currentYear}-12-31`,
    new Set(yearDuties.map((e) => e.date)),
    holidays
  ).map((w) => w.weekNumber);

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
  const colleagues = activeUsers
    .filter((u) => u.id !== userId)
    .map((u) => ({ id: u.id, name: u.name }));

  // Per-week colleague availability for the swap request form: a colleague is
  // only offered a week if they have no entry at all on any day of it (same
  // rule the swap actions enforce server-side).
  const allWeekDates = [...new Set([...weekGroups.values()].flat())];
  const blockingEntries = allWeekDates.length
    ? await prisma.entry.findMany({
        where: { userId: { in: colleagues.map((c) => c.id) }, date: { in: allWeekDates } },
        select: { userId: true, date: true },
      })
    : [];
  const blockedByDate = new Map<string, Set<number>>();
  for (const e of blockingEntries) {
    if (!blockedByDate.has(e.date)) blockedByDate.set(e.date, new Set());
    blockedByDate.get(e.date)!.add(e.userId);
  }

  const myWeeks = [...weekGroups.entries()]
    .filter(([, dates]) => dates.every((d) => !requestedDates.has(d)))
    .map(([start, dates]) => ({
      key: start,
      label: `KW ${isoWeekNumber(dates[0])} (${formatDateCH(dates[0])} – ${formatDateCH(dates[dates.length - 1])})`,
      dates,
      availableColleagueIds: colleagues
        .map((c) => c.id)
        .filter((id) => dates.every((d) => !blockedByDate.get(d)?.has(id))),
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

  // Broadcast ("an alle") requests create one row per colleague, all sharing
  // a groupId — collapse those back into a single outgoing entry. Cancelling
  // it (via the representative id) withdraws the whole group at once.
  const outgoingGroups = new Map<string, (typeof pendingSwaps)[number][]>();
  for (const r of pendingSwaps.filter((r) => r.fromUserId === userId)) {
    const key = r.groupId ?? `single-${r.id}`;
    if (!outgoingGroups.has(key)) outgoingGroups.set(key, []);
    outgoingGroups.get(key)!.push(r);
  }
  const outgoing = [...outgoingGroups.values()].map((rows) =>
    toSwapRow(
      rows[0],
      rows.length > 1 ? `Alle (${rows.map((r) => r.toUser.name).join(", ")})` : rows[0].toUser.name
    )
  );

  const data = yearUsers.map((u) => {
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
      <DutyOverviewCard
        thisWeek={dutyThisWeek}
        nextWeek={dutyNextWeek}
        uncoveredWeekNumbers={uncovered}
      />
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
