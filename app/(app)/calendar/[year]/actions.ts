"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EntryType, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin, requireEditor } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { runRotation } from "@/lib/rotation";
import { holidaySetForYear } from "@/lib/holidays";
import { isWeekend, parseDate, toDateString } from "@/lib/date";
import { notifyCalendarChange } from "@/lib/calendar-events";
import logger from "@/lib/logger";

const log = logger.child({ module: "calendar" });

export type Assignment = { date: string; userId: number };

// Server-action inputs arrive from the network, not just from our UI —
// validate shape before anything touches the DB.
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum.")
  .refine(
    (s) => {
      const d = parseDate(s);
      return !!d && toDateString(d) === s; // rejects e.g. 2026-02-31
    },
    { message: "Ungültiges Datum." }
  );
const commentSchema = z.string().max(500, "Kommentar ist zu lang.").optional();
const userIdSchema = z.number().int().positive();

const upsertEntrySchema = z.object({
  userId: userIdSchema,
  date: dateSchema,
  type: z.enum(EntryType).nullable(),
  comment: commentSchema,
});

const cellsSchema = z.array(z.object({ userId: userIdSchema, date: dateSchema })).max(5000);

const moveSchema = z.object({
  fromUserId: userIdSchema,
  fromDate: dateSchema,
  toUserId: userIdSchema,
  toDate: dateSchema,
});

type EntryClient = { entry: Pick<typeof prisma.entry, "findMany"> };

// SQLite's bound-parameter limit varies by build (999 on some, 32766 on
// others) and each cell in an `OR` lookup binds 2 params (userId + date), so
// a bulk action touching thousands of cells can exceed it in one query.
// Chunking well under the lowest common limit keeps this safe everywhere.
const CELL_QUERY_BATCH_SIZE = 400;

/** Looks up entries for a batch of (userId, date) cells, chunked to stay under SQLite's parameter limit. */
async function findEntriesForCells(client: EntryClient, cells: { userId: number; date: string }[]) {
  const results: Prisma.EntryGetPayload<object>[] = [];
  for (let i = 0; i < cells.length; i += CELL_QUERY_BATCH_SIZE) {
    const batch = cells.slice(i, i + CELL_QUERY_BATCH_SIZE);
    const found = await client.entry.findMany({
      where: { OR: batch.map((c) => ({ userId: c.userId, date: c.date })) },
    });
    results.push(...found);
  }
  return results;
}

// Editors may act on other users' S-Dienst entries (create/clear/move), since
// that's the shared duty roster. Every other entry type stays own-user-only
// for Editors — Admin is unrestricted throughout.
function assertEntryPermission(
  role: string,
  sessionUserId: string,
  targetUserId: number,
  isDienstOp: boolean
) {
  if (role === "Admin") return;
  if (targetUserId === Number(sessionUserId)) return;
  if (isDienstOp) return;
  throw new Error("Keine Berechtigung für diesen Benutzer.");
}

export async function upsertEntryAction(rawInput: {
  userId: number;
  date: string;
  type: EntryType | null;
  comment?: string;
}): Promise<{ error?: string }> {
  const session = await requireEditor();
  const parsedInput = upsertEntrySchema.safeParse(rawInput);
  if (!parsedInput.success) {
    return { error: parsedInput.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }
  const input = parsedInput.data;

  const existing = await prisma.entry.findUnique({
    where: { userId_date: { userId: input.userId, date: input.date } },
  });
  const isDienstOp = input.type === "S" || existing?.type === "S";
  try {
    assertEntryPermission(session.user.role, session.user.id, input.userId, isDienstOp);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Fehler" };
  }
  if (input.type === "S" && isWeekend(input.date)) {
    return { error: "Kein Dienst an Wochenenden." };
  }

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
  notifyCalendarChange(input.date.slice(0, 4));
  return {};
}

export async function bulkSetEntriesAction(
  rawCells: { userId: number; date: string }[],
  rawType: EntryType | null
): Promise<{ count: number; error?: string }> {
  const session = await requireEditor();
  const parsedCells = cellsSchema.safeParse(rawCells);
  const parsedType = z.enum(EntryType).nullable().safeParse(rawType);
  if (!parsedCells.success || !parsedType.success) {
    return { count: 0, error: "Ungültige Eingabe." };
  }
  const cells = parsedCells.data;
  const type = parsedType.data;
  const role = session.user.role;

  let existingTypes: Map<string, EntryType> | null = null;
  if (type === null) {
    const existing = await findEntriesForCells(prisma, cells);
    existingTypes = new Map(existing.map((e) => [`${e.userId}-${e.date}`, e.type]));
  }

  const allowed = cells.filter((c) => {
    const isDienstOp = type === "S" || existingTypes?.get(`${c.userId}-${c.date}`) === "S";
    try {
      assertEntryPermission(role, session.user.id, c.userId, isDienstOp);
      return true;
    } catch {
      return false;
    }
  });
  if (allowed.length === 0) return { count: 0 };

  if (type === "S" && allowed.some((c) => isWeekend(c.date))) {
    return { count: 0, error: "Kein Dienst an Wochenenden." };
  }

  let count = 0;
  const changedCells: { userId: number; date: string }[] = [];
  await prisma.$transaction(async (tx) => {
    for (const c of allowed) {
      if (type === null) {
        const existing = await tx.entry.findUnique({
          where: { userId_date: { userId: c.userId, date: c.date } },
        });
        if (existing) {
          await tx.entry.delete({ where: { id: existing.id } });
          changedCells.push({ userId: c.userId, date: c.date });
          count++;
        }
      } else {
        await tx.entry.upsert({
          where: { userId_date: { userId: c.userId, date: c.date } },
          create: { userId: c.userId, date: c.date, type, source: "Manual" },
          update: { type, source: "Manual" },
        });
        changedCells.push({ userId: c.userId, date: c.date });
        count++;
      }
    }
  });

  // Record which cells were touched, not just how many — capped so one giant
  // bulk edit can't balloon a single audit row.
  const MAX_AUDITED_CELLS = 1000;
  await logAudit(session, type === null ? "DELETE" : "UPDATE", "Entry", undefined, {
    bulk: true,
    count,
    type,
    cells: changedCells.slice(0, MAX_AUDITED_CELLS),
    ...(changedCells.length > MAX_AUDITED_CELLS ? { cellsTruncated: true } : {}),
  });

  for (const year of new Set(allowed.map((c) => c.date.slice(0, 4)))) {
    revalidatePath(`/calendar/${year}`);
    notifyCalendarChange(year);
  }
  return { count };
}

export async function moveEntryAction(rawInput: {
  fromUserId: number;
  fromDate: string;
  toUserId: number;
  toDate: string;
}): Promise<{ error?: string }> {
  const session = await requireEditor();
  const parsedInput = moveSchema.safeParse(rawInput);
  if (!parsedInput.success) return { error: "Ungültige Eingabe." };
  const input = parsedInput.data;

  let sourceId: number;
  try {
    sourceId = await prisma.$transaction(async (tx) => {
      // Re-checked inside the transaction (not just before it) so a
      // concurrent move can't slip into the gap between the check and the
      // write; the unique (userId, date) constraint is the final backstop
      // if it still does.
      const source = await tx.entry.findUnique({
        where: { userId_date: { userId: input.fromUserId, date: input.fromDate } },
      });
      if (!source) {
        throw new Error("Quellzelle ist leer.");
      }
      // Cross-user moves are only ever valid for S-Dienst entries (the
      // shared duty roster) — every other type stays own-user-only, same as
      // a direct edit would be.
      const isDienstOp = source.type === "S";
      assertEntryPermission(session.user.role, session.user.id, input.fromUserId, isDienstOp);
      assertEntryPermission(session.user.role, session.user.id, input.toUserId, isDienstOp);
      if (isDienstOp && isWeekend(input.toDate)) {
        throw new Error("Kein Dienst an Wochenenden.");
      }

      const destExisting = await tx.entry.findUnique({
        where: { userId_date: { userId: input.toUserId, date: input.toDate } },
      });
      if (destExisting) {
        throw new Error("Zielzelle ist bereits belegt.");
      }

      await tx.entry.delete({ where: { id: source.id } });
      await tx.entry.create({
        data: {
          userId: input.toUserId,
          date: input.toDate,
          type: source.type,
          source: "Swap",
          comment: source.comment,
        },
      });
      return source.id;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Zielzelle ist bereits belegt." };
    }
    if (err instanceof Error) return { error: err.message };
    log.error({ err, input }, "Unexpected error moving entry");
    throw err;
  }

  await logAudit(session, "MOVE", "Entry", sourceId, {
    from: { userId: input.fromUserId, date: input.fromDate },
    to: { userId: input.toUserId, date: input.toDate },
  });

  for (const year of new Set([input.fromDate.slice(0, 4), input.toDate.slice(0, 4)])) {
    revalidatePath(`/calendar/${year}`);
    notifyCalendarChange(year);
  }
  return {};
}

export async function moveEntriesAction(
  rawMoves: { fromUserId: number; fromDate: string; toUserId: number; toDate: string }[]
): Promise<{ count?: number; error?: string }> {
  const session = await requireEditor();
  const parsedMoves = z.array(moveSchema).max(5000).safeParse(rawMoves);
  if (!parsedMoves.success) return { error: "Ungültige Eingabe." };
  const moves = parsedMoves.data;
  if (moves.length === 0) return { count: 0 };

  const targetKeys = new Set(moves.map((m) => `${m.toUserId}-${m.toDate}`));
  if (targetKeys.size !== moves.length) {
    return { error: "Mehrere Dienste können nicht auf dieselbe Zielzelle verschoben werden." };
  }

  const sourceKeys = new Set(moves.map((m) => `${m.fromUserId}-${m.fromDate}`));

  try {
    // Sources/destinations are (re-)checked inside the transaction, not just
    // before it, so a concurrent move can't slip into the gap between the
    // check and the write; the unique (userId, date) constraint (caught as
    // P2002 below) is the final backstop if it still does.
    await prisma.$transaction(async (tx) => {
      const sources = await findEntriesForCells(
        tx,
        moves.map((m) => ({ userId: m.fromUserId, date: m.fromDate }))
      );
      const sourceMap = new Map(sources.map((s) => [`${s.userId}-${s.date}`, s]));
      for (const m of moves) {
        const s = sourceMap.get(`${m.fromUserId}-${m.fromDate}`);
        if (!s) {
          throw new Error("Quellzelle ist leer.");
        }
        // Cross-user moves are only ever valid for S-Dienst entries (the
        // shared duty roster) — every other type stays own-user-only, same
        // as a direct edit would be.
        const isDienstOp = s.type === "S";
        assertEntryPermission(session.user.role, session.user.id, m.fromUserId, isDienstOp);
        assertEntryPermission(session.user.role, session.user.id, m.toUserId, isDienstOp);
        if (isDienstOp && isWeekend(m.toDate)) {
          throw new Error("Kein Dienst an Wochenenden.");
        }
      }

      // A destination is fine if it's empty, or if it's only occupied by one
      // of the entries in this same batch (which will be vacated by this move).
      const destinations = await findEntriesForCells(
        tx,
        moves.map((m) => ({ userId: m.toUserId, date: m.toDate }))
      );
      for (const d of destinations) {
        if (!sourceKeys.has(`${d.userId}-${d.date}`)) {
          throw new Error("Zielzelle ist bereits belegt.");
        }
      }

      // Delete all sources before creating any destination so overlapping
      // moves (shifts/swaps within the same batch) don't hit the unique
      // (userId, date) constraint mid-transaction.
      for (const m of moves) {
        const s = sourceMap.get(`${m.fromUserId}-${m.fromDate}`)!;
        await tx.entry.delete({ where: { id: s.id } });
      }
      for (const m of moves) {
        const s = sourceMap.get(`${m.fromUserId}-${m.fromDate}`)!;
        await tx.entry.create({
          data: { userId: m.toUserId, date: m.toDate, type: s.type, source: "Swap", comment: s.comment },
        });
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Zielzelle ist bereits belegt." };
    }
    if (err instanceof Error) return { error: err.message };
    log.error({ err, moveCount: moves.length }, "Unexpected error moving entries");
    throw err;
  }

  await logAudit(session, "MOVE", "Entry", undefined, { bulk: true, count: moves.length, moves });

  const years = new Set<string>();
  for (const m of moves) {
    years.add(m.fromDate.slice(0, 4));
    years.add(m.toDate.slice(0, 4));
  }
  for (const year of years) {
    revalidatePath(`/calendar/${year}`);
    notifyCalendarChange(year);
  }

  return { count: moves.length };
}

export async function generateAutomationAction(
  rawYear: number
): Promise<{ count: number; uncoveredWeeks: string[] }> {
  const session = await requireAdmin();
  const year = z.number().int().min(2000).max(2100).parse(rawYear);

  const [users, holidays, existing, lastAutomatic] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, orderBy: { rotationOrder: "asc" } }),
    holidaySetForYear(year),
    prisma.entry.findMany({ where: { date: { startsWith: `${year}-` } } }),
    // Whoever had the last automated duty before this year — the rotation
    // continues after them instead of restarting at the first user.
    prisma.entry.findFirst({
      where: { type: "S", source: "Automatic", date: { lt: `${year}-01-01` } },
      orderBy: { date: "desc" },
      select: { userId: true },
    }),
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

  const { assignments, uncoveredWeeks } = runRotation({
    year,
    users: users.map((u) => ({ userId: u.id, rotationOrder: u.rotationOrder })),
    holidays,
    blockedDates,
    occupiedDates,
    startAfterUserId: lastAutomatic?.userId,
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

  await logAudit(session, "AUTOMATIC", "Entry", undefined, { year, count, uncoveredWeeks });
  revalidatePath(`/calendar/${year}`);
  notifyCalendarChange(year);
  return { count, uncoveredWeeks };
}
