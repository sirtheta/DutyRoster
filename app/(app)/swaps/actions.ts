"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import { requireSession } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { dispatchPendingNotifications, notifyChannelsFor } from "@/lib/notifications";
import { notifyCalendarChange } from "@/lib/calendar-events";
import { formatDateCH, parseDate, toDateString } from "@/lib/date";
import { todayString } from "@/lib/app-time";
import { appOrigin } from "@/lib/origin";

const log = logger.child({ module: "swaps" });

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum.")
  .refine((s) => {
    const d = parseDate(s);
    return !!d && toDateString(d) === s;
  }, "Ungültiges Datum.");

const createSchema = z.object({
  // null means "broadcast to every active colleague".
  toUserId: z.number().int().positive().nullable(),
  dates: z.array(dateSchema).min(1).max(10),
  comment: z.string().max(1000, "Kommentar ist zu lang.").optional(),
});

/**
 * Queues a transactional notification (independent of the user's weekly
 * reminder opt-in) and tries to send it right away; failures stay in the
 * queue for the next scheduled retry.
 */
async function notifyUser(userId: number, subject: string, body: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const link = `${await appOrigin()}/dashboard`;
  const fullBody = `${body}\n\n${link}`;
  for (const channel of notifyChannelsFor(user)) {
    await prisma.pendingNotification.create({ data: { userId, channel, subject, body: fullBody } });
  }
  try {
    await dispatchPendingNotifications(prisma);
  } catch (err) {
    log.error({ err, userId }, "Failed to dispatch swap notification");
  }
}

function formatDates(dates: string[]): string {
  return dates.map(formatDateCH).join(", ");
}

/**
 * Requests that a colleague takes over the caller's own S-duties on the given
 * days. If `toUserId` is null, broadcasts the offer to every active colleague
 * at once (one `SwapRequest` row each, tied together by `groupId`) — whoever
 * accepts first gets the duties, and the rest are marked Superseded.
 */
export async function createSwapRequestAction(rawInput: {
  toUserId: number | null;
  dates: string[];
  comment?: string;
}): Promise<{ error?: string }> {
  const session = await requireSession();
  const fromUserId = parseInt(session.user.id, 10);

  const parsed = createSchema.safeParse(rawInput);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { toUserId, comment } = parsed.data;
  const dates = [...new Set(parsed.data.dates)].sort();

  if (toUserId === fromUserId) {
    return { error: "Du kannst keinen Tausch mit dir selbst anfragen." };
  }

  const today = todayString();
  if (dates.some((d) => d < today)) {
    return { error: "Vergangene Dienste können nicht getauscht werden." };
  }

  const entries = await prisma.entry.findMany({
    where: { userId: fromUserId, date: { in: dates }, type: "S" },
  });
  if (entries.length !== dates.length) {
    return { error: "Nur eigene S-Dienste können zum Tausch angeboten werden." };
  }

  const candidates =
    toUserId === null
      ? await prisma.user.findMany({ where: { isActive: true, id: { not: fromUserId } } })
      : await prisma.user
          .findUnique({ where: { id: toUserId } })
          .then((u) => (u && u.isActive ? [u] : []));
  if (candidates.length === 0) return { error: "Benutzer nicht gefunden." };

  // Only offer the swap to colleagues who have no entry at all on any of the
  // requested days (same rule enforced at accept time) — a broadcast silently
  // skips unavailable colleagues, a single target is rejected outright.
  const blocked = await prisma.entry.findMany({
    where: { userId: { in: candidates.map((c) => c.id) }, date: { in: dates } },
    select: { userId: true },
  });
  const blockedIds = new Set(blocked.map((e) => e.userId));
  const targets = candidates.filter((c) => !blockedIds.has(c.id));
  if (targets.length === 0) {
    return {
      error:
        toUserId === null
          ? "Kein Kollege ist in diesem Zeitraum verfügbar."
          : "Diese Person ist in diesem Zeitraum nicht verfügbar.",
    };
  }

  // The "no open request yet" check and the create happen inside one
  // transaction so two concurrent submits for the same dates (e.g. a
  // double-click) can't both pass the check and double-create — SQLite
  // serializes transactions, so the second call sees the first one's rows.
  let requests;
  try {
    requests = await prisma.$transaction(async (tx) => {
      const openRequests = await tx.swapRequest.findMany({
        where: { fromUserId, status: "Pending" },
      });
      const openDates = new Set(openRequests.flatMap((r) => JSON.parse(r.dates) as string[]));
      if (dates.some((d) => openDates.has(d))) {
        throw new Error("OPEN_REQUEST_EXISTS");
      }

      const groupId = targets.length > 1 ? randomUUID() : null;
      return Promise.all(
        targets.map((target) =>
          tx.swapRequest.create({
            data: { fromUserId, toUserId: target.id, dates: JSON.stringify(dates), comment, groupId },
          })
        )
      );
    });
  } catch (err) {
    if (err instanceof Error && err.message === "OPEN_REQUEST_EXISTS") {
      return { error: "Für mindestens einen dieser Tage besteht bereits eine offene Anfrage." };
    }
    throw err;
  }
  const groupId = requests.length > 1 ? requests[0].groupId : null;
  await logAudit(session, "CREATE", "SwapRequest", requests[0].id, {
    toUserIds: targets.map((t) => t.id),
    groupId,
    dates,
  });

  for (const target of targets) {
    await notifyUser(
      target.id,
      "Sanitätsplaner: Anfrage für Diensttausch",
      `Hallo ${target.name}\n\n${session.user.name} möchte S-Dienste übergeben: ${formatDates(dates)}.` +
        (groupId ? " Die Anfrage wurde an alle verfügbaren Kolleginnen und Kollegen gestellt — wer zuerst annimmt, übernimmt." : "") +
        (comment ? `\n\nKommentar:\n${comment}` : "") +
        `\n\nBitte bestätige oder lehne die Anfrage im Sanitätsplaner ab.`
    );
  }

  revalidatePath("/dashboard");
  return {};
}

/**
 * Accepts an incoming swap request and moves the S-duty entries to the caller.
 * `acceptedDates` limits the takeover to a subset of the requested days (all
 * days when omitted); the remaining days stay with the requester, and on a
 * broadcast they remain open for the other colleagues.
 */
export async function acceptSwapRequestAction(
  requestId: number,
  acceptedDates?: string[]
): Promise<{ error?: string }> {
  const session = await requireSession();
  const sessionUserId = parseInt(session.user.id, 10);

  const request = await prisma.swapRequest.findUnique({
    where: { id: requestId },
    include: { fromUser: true, toUser: true },
  });
  if (!request || request.status !== "Pending") return { error: "Anfrage nicht gefunden." };
  if (request.toUserId !== sessionUserId && session.user.role !== "Admin") {
    return { error: "Keine Berechtigung für diese Anfrage." };
  }

  const requestedDates = JSON.parse(request.dates) as string[];
  const dates = acceptedDates ? [...new Set(acceptedDates)].sort() : requestedDates;
  if (dates.length === 0 || dates.some((d) => !requestedDates.includes(d))) {
    return { error: "Ungültige Tagesauswahl." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      // Guard against a race with a concurrent accept/decline/cancel: only
      // proceeds if the row is still Pending, so two simultaneous accepts
      // (e.g. two colleagues on a broadcast request) can't both go through.
      // The row is rewritten to the days actually taken over.
      const { count } = await tx.swapRequest.updateMany({
        where: { id: request.id, status: "Pending" },
        data: { status: "Accepted", decidedAt: new Date(), dates: JSON.stringify(dates) },
      });
      if (count === 0) {
        throw new Error("Anfrage wurde bereits bearbeitet.");
      }
      for (const date of dates) {
        const source = await tx.entry.findUnique({
          where: { userId_date: { userId: request.fromUserId, date } },
        });
        if (!source || source.type !== "S") {
          throw new Error(`Der Dienst am ${formatDateCH(date)} existiert nicht mehr.`);
        }
        const dest = await tx.entry.findUnique({
          where: { userId_date: { userId: request.toUserId, date } },
        });
        if (dest) {
          throw new Error(`Am ${formatDateCH(date)} hast du bereits einen Eintrag.`);
        }
        await tx.entry.delete({ where: { id: source.id } });
        await tx.entry.create({
          data: {
            userId: request.toUserId,
            date,
            type: "S",
            source: "Swap",
            comment: source.comment,
          },
        });
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Ein Zieltag ist bereits belegt." };
    }
    if (err instanceof Error) return { error: err.message };
    throw err;
  }

  await logAudit(session, "MOVE", "SwapRequest", request.id, {
    action: "accept",
    fromUserId: request.fromUserId,
    toUserId: request.toUserId,
    dates,
    requestedDates,
  });
  await notifyUser(
    request.fromUserId,
    "Sanitätsplaner: Diensttausch bestätigt",
    `Hallo ${request.fromUser.name}\n\n${request.toUser.name} hat deine Tauschanfrage angenommen und übernimmt: ${formatDates(dates)}.` +
      (dates.length < requestedDates.length
        ? ` Die übrigen Tage (${formatDates(requestedDates.filter((d) => !dates.includes(d)))}) bleiben bei dir.`
        : "")
  );
  // The new duty holder gets an immediate confirmation too: the weekly
  // reminder slot may already have passed, so they'd otherwise hear nothing.
  await notifyUser(
    request.toUserId,
    "Sanitätsplaner: Du hast Dienst übernommen",
    `Hallo ${request.toUser.name}\n\nDu hast von ${request.fromUser.name} den S-Dienst übernommen: ${formatDates(dates)}.`
  );

  // If this was part of a broadcast (an "an alle" request), the days taken
  // over are gone for the other invitees: requests left with no days are
  // closed, the others shrink to the remaining days and stay open.
  if (request.groupId) {
    const siblings = await prisma.swapRequest.findMany({
      where: { groupId: request.groupId, status: "Pending", id: { not: request.id } },
      include: { toUser: true },
    });
    for (const sibling of siblings) {
      const remaining = (JSON.parse(sibling.dates) as string[]).filter((d) => !dates.includes(d));
      if (remaining.length === 0) {
        await prisma.swapRequest.updateMany({
          where: { id: sibling.id, status: "Pending" },
          data: { status: "Superseded", decidedAt: new Date() },
        });
        await notifyUser(
          sibling.toUserId,
          "Sanitätsplaner: Diensttausch bereits vergeben",
          `Hallo ${sibling.toUser.name}\n\nDie Tauschanfrage von ${request.fromUser.name} für ${formatDates(dates)} wurde bereits von jemand anderem angenommen.`
        );
      } else {
        await prisma.swapRequest.updateMany({
          where: { id: sibling.id, status: "Pending" },
          data: { dates: JSON.stringify(remaining) },
        });
        await notifyUser(
          sibling.toUserId,
          "Sanitätsplaner: Diensttausch teilweise vergeben",
          `Hallo ${sibling.toUser.name}\n\nVon der Tauschanfrage von ${request.fromUser.name} wurde ${formatDates(dates)} bereits von jemand anderem übernommen. Noch offen: ${formatDates(remaining)}.`
        );
      }
    }
  }

  for (const year of new Set(dates.map((d) => d.slice(0, 4)))) {
    revalidatePath(`/calendar/${year}`);
    notifyCalendarChange(year);
  }
  revalidatePath("/dashboard");
  return {};
}

/** Declines an incoming swap request. */
export async function declineSwapRequestAction(requestId: number): Promise<{ error?: string }> {
  const session = await requireSession();
  const sessionUserId = parseInt(session.user.id, 10);

  const request = await prisma.swapRequest.findUnique({
    where: { id: requestId },
    include: { fromUser: true, toUser: true },
  });
  if (!request || request.status !== "Pending") return { error: "Anfrage nicht gefunden." };
  if (request.toUserId !== sessionUserId && session.user.role !== "Admin") {
    return { error: "Keine Berechtigung für diese Anfrage." };
  }

  // Guard against a race with a concurrent accept: only transitions the row
  // if it's still Pending, so an in-flight accept can't be overwritten.
  const { count } = await prisma.swapRequest.updateMany({
    where: { id: request.id, status: "Pending" },
    data: { status: "Declined", decidedAt: new Date() },
  });
  if (count === 0) return { error: "Anfrage wurde bereits bearbeitet." };
  await logAudit(session, "UPDATE", "SwapRequest", request.id, { action: "decline" });
  // For a broadcast request, a single decline is routine (most invitees won't
  // take it) — notifying the requester every time would just be noise; the
  // requester still hears about it once someone accepts or they cancel.
  if (!request.groupId) {
    await notifyUser(
      request.fromUserId,
      "Sanitätsplaner: Diensttausch abgelehnt",
      `Hallo ${request.fromUser.name}\n\n${request.toUser.name} hat deine Tauschanfrage für ${formatDates(JSON.parse(request.dates))} abgelehnt.`
    );
  }

  revalidatePath("/dashboard");
  return {};
}

/** Withdraws one's own pending swap request. */
export async function cancelSwapRequestAction(requestId: number): Promise<{ error?: string }> {
  const session = await requireSession();
  const sessionUserId = parseInt(session.user.id, 10);

  const request = await prisma.swapRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "Pending") return { error: "Anfrage nicht gefunden." };
  if (request.fromUserId !== sessionUserId && session.user.role !== "Admin") {
    return { error: "Keine Berechtigung für diese Anfrage." };
  }

  // Guard against a race with a concurrent accept: select and update the
  // still-Pending rows inside one transaction, so an in-flight accept can't
  // be overwritten and can't be double-notified as "cancelled" either. For a
  // broadcast request, cancelling one row withdraws the whole group at once.
  const cancelled = await prisma.$transaction(async (tx) => {
    const toCancel = await tx.swapRequest.findMany({
      where: request.groupId
        ? { groupId: request.groupId, status: "Pending" }
        : { id: request.id, status: "Pending" },
      include: { toUser: true },
    });
    if (toCancel.length === 0) return null;
    await tx.swapRequest.updateMany({
      where: { id: { in: toCancel.map((r) => r.id) } },
      data: { status: "Cancelled", decidedAt: new Date() },
    });
    return toCancel;
  });
  if (!cancelled) return { error: "Anfrage wurde bereits bearbeitet." };
  await logAudit(session, "UPDATE", "SwapRequest", request.id, { action: "cancel", groupId: request.groupId });

  for (const r of cancelled) {
    await notifyUser(
      r.toUserId,
      "Sanitätsplaner: Tauschanfrage zurückgezogen",
      `Hallo ${r.toUser.name}\n\n${session.user.name} hat die Tauschanfrage für ${formatDates(JSON.parse(r.dates))} zurückgezogen.`
    );
  }

  revalidatePath("/dashboard");
  return {};
}
