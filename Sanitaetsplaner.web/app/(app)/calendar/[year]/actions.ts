"use server";

import { revalidatePath } from "next/cache";
import { EntryType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin, requireEditor } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { runRotation } from "@/lib/rotation";
import { holidaySetForYear } from "@/lib/holidays";

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

export async function previewAutomationAction(year: number): Promise<Assignment[]> {
  await requireAdmin();

  const [users, settings, holidays, existing] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, orderBy: { rotationOrder: "asc" } }),
    prisma.systemSettings.findUnique({ where: { id: 1 } }),
    holidaySetForYear(year),
    prisma.entry.findMany({ where: { date: { startsWith: `${year}-` } } }),
  ]);

  const blockedDates = new Map<number, Set<string>>();
  for (const e of existing) {
    if (!blockedDates.has(e.userId)) blockedDates.set(e.userId, new Set());
    blockedDates.get(e.userId)!.add(e.date);
  }

  return runRotation({
    year,
    users: users.map((u) => ({ userId: u.id, rotationOrder: u.rotationOrder })),
    blockSize: settings?.rotationBlockSize ?? 5,
    holidays,
    blockedDates,
  });
}

export async function applyAutomationAction(
  year: number,
  assignments: Assignment[]
): Promise<{ count: number }> {
  const session = await requireAdmin();

  // SQLite has no createMany `skipDuplicates` support, and a race between
  // preview and apply could mean a slot got filled in the meantime — so each
  // row is created individually and conflicts are simply skipped.
  let count = 0;
  await prisma.$transaction(async (tx) => {
    for (const a of assignments) {
      try {
        await tx.entry.create({
          data: { userId: a.userId, date: a.date, type: "S", source: "Automatic" },
        });
        count++;
      } catch {
        // unique constraint (userId, date) — slot filled since the preview, skip
      }
    }
  });

  await logAudit(session, "AUTOMATIC", "Entry", undefined, { year, count });
  revalidatePath(`/calendar/${year}`);
  return { count };
}
