"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import { requireSession } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { dispatchPendingNotifications, notifyChannelsFor } from "@/lib/notifications";
import { notifyCalendarChange } from "@/lib/calendar-events";
import { formatDateCH, parseDate, toDateString } from "@/lib/date";

const log = logger.child({ module: "swaps" });

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum.")
  .refine((s) => {
    const d = parseDate(s);
    return !!d && toDateString(d) === s;
  }, "Ungültiges Datum.");

const createSchema = z.object({
  toUserId: z.number().int().positive(),
  dates: z.array(dateSchema).min(1).max(10),
  comment: z.string().max(500, "Kommentar ist zu lang.").optional(),
});

/**
 * Queues a transactional notification (independent of the user's weekly
 * reminder opt-in) and tries to send it right away; failures stay in the
 * queue for the hourly retry.
 */
async function notifyUser(userId: number, subject: string, body: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  for (const channel of notifyChannelsFor(user)) {
    await prisma.pendingNotification.create({ data: { userId, channel, subject, body } });
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

/** Requests that a colleague takes over the caller's own S-duties on the given days. */
export async function createSwapRequestAction(rawInput: {
  toUserId: number;
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
  const target = await prisma.user.findUnique({ where: { id: toUserId } });
  if (!target || !target.isActive) return { error: "Benutzer nicht gefunden." };

  const today = toDateString(new Date());
  if (dates.some((d) => d < today)) {
    return { error: "Vergangene Dienste können nicht getauscht werden." };
  }

  const entries = await prisma.entry.findMany({
    where: { userId: fromUserId, date: { in: dates }, type: "S" },
  });
  if (entries.length !== dates.length) {
    return { error: "Nur eigene S-Dienste können zum Tausch angeboten werden." };
  }

  const openRequests = await prisma.swapRequest.findMany({
    where: { fromUserId, status: "Pending" },
  });
  const openDates = new Set(openRequests.flatMap((r) => JSON.parse(r.dates) as string[]));
  if (dates.some((d) => openDates.has(d))) {
    return { error: "Für mindestens einen dieser Tage besteht bereits eine offene Anfrage." };
  }

  const request = await prisma.swapRequest.create({
    data: { fromUserId, toUserId, dates: JSON.stringify(dates), comment },
  });
  await logAudit(session, "CREATE", "SwapRequest", request.id, { toUserId, dates });

  await notifyUser(
    toUserId,
    "Sanitätsplaner: Anfrage für Diensttausch",
    `Hallo ${target.name}\n\n${session.user.name} möchte dir S-Dienste übergeben: ${formatDates(dates)}.` +
      (comment ? `\nKommentar: ${comment}` : "") +
      `\n\nBitte bestätige oder lehne die Anfrage im Sanitätsplaner (Dashboard) ab.`
  );

  revalidatePath("/dashboard");
  return {};
}

/** Accepts an incoming swap request and moves the S-duty entries to the caller. */
export async function acceptSwapRequestAction(requestId: number): Promise<{ error?: string }> {
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

  const dates = JSON.parse(request.dates) as string[];
  try {
    await prisma.$transaction(async (tx) => {
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
      await tx.swapRequest.update({
        where: { id: request.id },
        data: { status: "Accepted", decidedAt: new Date() },
      });
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
  });
  await notifyUser(
    request.fromUserId,
    "Sanitätsplaner: Diensttausch bestätigt",
    `Hallo ${request.fromUser.name}\n\n${request.toUser.name} hat deine Tauschanfrage angenommen und übernimmt: ${formatDates(dates)}.`
  );

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

  await prisma.swapRequest.update({
    where: { id: request.id },
    data: { status: "Declined", decidedAt: new Date() },
  });
  await logAudit(session, "UPDATE", "SwapRequest", request.id, { action: "decline" });
  await notifyUser(
    request.fromUserId,
    "Sanitätsplaner: Diensttausch abgelehnt",
    `Hallo ${request.fromUser.name}\n\n${request.toUser.name} hat deine Tauschanfrage für ${formatDates(JSON.parse(request.dates))} abgelehnt.`
  );

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

  await prisma.swapRequest.update({
    where: { id: request.id },
    data: { status: "Cancelled", decidedAt: new Date() },
  });
  await logAudit(session, "UPDATE", "SwapRequest", request.id, { action: "cancel" });

  revalidatePath("/dashboard");
  return {};
}
