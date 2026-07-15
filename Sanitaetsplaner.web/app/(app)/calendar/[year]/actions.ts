"use server";

import { revalidatePath } from "next/cache";
import { EntryType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin, requireEditor } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { runRotation } from "@/lib/rotation";
import { holidaySetForYear } from "@/lib/holidays";
import { isWeekend } from "@/lib/date";

export type Assignment = { date: string; userId: number };

function assertOwnEntry(sessionUserId: string, role: string, targetUserId: number) {
  if (role !== "Admin" && targetUserId !== Number(sessionUserId)) {
    throw new Error("Keine Berechtigung für diesen Benutzer.");
  }
}

export async function upsertEntryAction(input: {
  userId: number;
  date: string;
  type: EntryType | null;
  comment?: string;
}): Promise<{ error?: string }> {
  const session = await requireEditor();
  try {
    assertOwnEntry(session.user.id, session.user.role, input.userId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Fehler" };
  }
  if (input.type === "S" && isWeekend(input.date)) {
    return { error: "Kein Dienst an Wochenenden." };
  }

  const existing = await prisma.entry.findUnique({
    where: { userId_date: { userId: input.userId, date: input.date } },
  });

  if (input.type === null) {
    if (existing) {
      await prisma.entry.delete({ where: { id: existing.id } });
      await logAudit(session, "DELETE", "Entry", existing.id, {
        userId: input.userId,
        date: input.date,
        before: existing.type,
      });
    }
  } else {
    const entry = await prisma.entry.upsert({
      where: { userId_date: { userId: input.userId, date: input.date } },
      create: {
        userId: input.userId,
        date: input.date,
        type: input.type,
        source: "Manual",
        comment: input.comment,
      },
      update: { type: input.type, source: "Manual", comment: input.comment },
    });
    await logAudit(session, existing ? "UPDATE" : "CREATE", "Entry", entry.id, {
      userId: input.userId,
      date: input.date,
      before: existing?.type ?? null,
      after: input.type,
    });
  }

  revalidatePath(`/calendar/${input.date.slice(0, 4)}`);
  return {};
}

export async function bulkSetEntriesAction(
  cells: { userId: number; date: string }[],
  type: EntryType | null
): Promise<{ count: number; error?: string }> {
  const session = await requireEditor();
  const role = session.user.role;
  const sessionUserId = Number(session.user.id);

  const allowed = cells.filter((c) => role === "Admin" || c.userId === sessionUserId);
  if (allowed.length === 0) return { count: 0 };

  if (type === "S" && allowed.some((c) => isWeekend(c.date))) {
    return { count: 0, error: "Kein Dienst an Wochenenden." };
  }

  let count = 0;
  await prisma.$transaction(async (tx) => {
    for (const c of allowed) {
      if (type === null) {
        const existing = await tx.entry.findUnique({
          where: { userId_date: { userId: c.userId, date: c.date } },
        });
        if (existing) {
          await tx.entry.delete({ where: { id: existing.id } });
          count++;
        }
      } else {
        await tx.entry.upsert({
          where: { userId_date: { userId: c.userId, date: c.date } },
          create: { userId: c.userId, date: c.date, type, source: "Manual" },
          update: { type, source: "Manual" },
        });
        count++;
      }
    }
  });

  await logAudit(session, type === null ? "DELETE" : "UPDATE", "Entry", undefined, {
    bulk: true,
    count,
    type,
  });

  for (const year of new Set(allowed.map((c) => c.date.slice(0, 4)))) {
    revalidatePath(`/calendar/${year}`);
  }
  return { count };
}

export async function moveEntryAction(input: {
  fromUserId: number;
  fromDate: string;
  toUserId: number;
  toDate: string;
}): Promise<{ error?: string }> {
  const session = await requireEditor();
  try {
    assertOwnEntry(session.user.id, session.user.role, input.fromUserId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Fehler" };
  }
  if (session.user.role !== "Admin" && input.toUserId !== input.fromUserId) {
    return { error: "Nur Admins können Dienste anderen Benutzern zuweisen." };
  }
  if (isWeekend(input.toDate)) {
    return { error: "Kein Dienst an Wochenenden." };
  }

  const source = await prisma.entry.findUnique({
    where: { userId_date: { userId: input.fromUserId, date: input.fromDate } },
  });
  if (!source || source.type !== "S") {
    return { error: "Nur S-Dienste können verschoben werden." };
  }

  const destExisting = await prisma.entry.findUnique({
    where: { userId_date: { userId: input.toUserId, date: input.toDate } },
  });
  if (destExisting) {
    return { error: "Zielzelle ist bereits belegt." };
  }

  await prisma.$transaction([
    prisma.entry.delete({ where: { id: source.id } }),
    prisma.entry.create({
      data: {
        userId: input.toUserId,
        date: input.toDate,
        type: "S",
        source: "Swap",
        comment: source.comment,
      },
    }),
  ]);

  await logAudit(session, "MOVE", "Entry", source.id, {
    from: { userId: input.fromUserId, date: input.fromDate },
    to: { userId: input.toUserId, date: input.toDate },
  });

  revalidatePath(`/calendar/${input.fromDate.slice(0, 4)}`);
  revalidatePath(`/calendar/${input.toDate.slice(0, 4)}`);
  return {};
}

export async function moveEntriesAction(
  moves: { fromUserId: number; fromDate: string; toUserId: number; toDate: string }[]
): Promise<{ count?: number; error?: string }> {
  const session = await requireEditor();
  if (moves.length === 0) return { count: 0 };

  const role = session.user.role;
  for (const m of moves) {
    try {
      assertOwnEntry(session.user.id, role, m.fromUserId);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Fehler" };
    }
    if (role !== "Admin" && m.toUserId !== m.fromUserId) {
      return { error: "Nur Admins können Dienste anderen Benutzern zuweisen." };
    }
    if (isWeekend(m.toDate)) {
      return { error: "Kein Dienst an Wochenenden." };
    }
  }

  const targetKeys = new Set(moves.map((m) => `${m.toUserId}-${m.toDate}`));
  if (targetKeys.size !== moves.length) {
    return { error: "Mehrere Dienste können nicht auf dieselbe Zielzelle verschoben werden." };
  }

  const sources = await prisma.entry.findMany({
    where: { OR: moves.map((m) => ({ userId: m.fromUserId, date: m.fromDate })) },
  });
  const sourceMap = new Map(sources.map((s) => [`${s.userId}-${s.date}`, s]));
  for (const m of moves) {
    const s = sourceMap.get(`${m.fromUserId}-${m.fromDate}`);
    if (!s || s.type !== "S") {
      return { error: "Nur S-Dienste können verschoben werden." };
    }
  }

  // A destination is fine if it's empty, or if it's only occupied by one of
  // the entries in this same batch (which will be vacated by this move).
  const sourceKeys = new Set(sourceMap.keys());
  const destinations = await prisma.entry.findMany({
    where: { OR: moves.map((m) => ({ userId: m.toUserId, date: m.toDate })) },
  });
  for (const d of destinations) {
    if (!sourceKeys.has(`${d.userId}-${d.date}`)) {
      return { error: "Zielzelle ist bereits belegt." };
    }
  }

  // Delete all sources before creating any destination so overlapping
  // moves (shifts/swaps within the same batch) don't hit the unique
  // (userId, date) constraint mid-transaction.
  await prisma.$transaction(async (tx) => {
    for (const m of moves) {
      const s = sourceMap.get(`${m.fromUserId}-${m.fromDate}`)!;
      await tx.entry.delete({ where: { id: s.id } });
    }
    for (const m of moves) {
      const s = sourceMap.get(`${m.fromUserId}-${m.fromDate}`)!;
      await tx.entry.create({
        data: { userId: m.toUserId, date: m.toDate, type: "S", source: "Swap", comment: s.comment },
      });
    }
  });

  await logAudit(session, "MOVE", "Entry", undefined, { bulk: true, count: moves.length, moves });

  const years = new Set<string>();
  for (const m of moves) {
    years.add(m.fromDate.slice(0, 4));
    years.add(m.toDate.slice(0, 4));
  }
  for (const year of years) revalidatePath(`/calendar/${year}`);

  return { count: moves.length };
}

export async function generateAutomationAction(year: number): Promise<{ count: number }> {
  const session = await requireAdmin();

  const [users, holidays, existing] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, orderBy: { rotationOrder: "asc" } }),
    holidaySetForYear(year),
    prisma.entry.findMany({ where: { date: { startsWith: `${year}-` } } }),
  ]);

  const blockedDates = new Map<number, Set<string>>();
  const occupiedDates = new Set<string>();
  const existingKeys = new Set<string>();
  for (const e of existing) {
    if (!blockedDates.has(e.userId)) blockedDates.set(e.userId, new Set());
    blockedDates.get(e.userId)!.add(e.date);
    if (e.type === "S") occupiedDates.add(e.date);
    existingKeys.add(`${e.userId}-${e.date}`);
  }

  const assignments = runRotation({
    year,
    users: users.map((u) => ({ userId: u.id, rotationOrder: u.rotationOrder })),
    holidays,
    blockedDates,
    occupiedDates,
  });

  // Days that already have an entry (from an earlier run or manual edit)
  // are never touched, so re-running the generator can't create duplicates.
  let count = 0;
  await prisma.$transaction(async (tx) => {
    for (const a of assignments) {
      if (existingKeys.has(`${a.userId}-${a.date}`)) continue;
      try {
        await tx.entry.create({
          data: { userId: a.userId, date: a.date, type: "S", source: "Automatic" },
        });
        count++;
      } catch {
        // unique constraint (userId, date) — filled concurrently, skip
      }
    }
  });

  await logAudit(session, "AUTOMATIC", "Entry", undefined, { year, count });
  revalidatePath(`/calendar/${year}`);
  return { count };
}
