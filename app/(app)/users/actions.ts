"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bcryptRounds } from "@/lib/password";
import { Prisma, UserRole, NotifyChannel } from "@prisma/client";
import { parseDate, toDateString } from "@/lib/date";
import { notifyCalendarChange } from "@/lib/calendar-events";
import { generateAutomationAction } from "@/app/(app)/calendar/[year]/actions";
import { sendPlanEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
import logger from "@/lib/logger";

const log = logger.child({ module: "users" });

const userSchema = z
  .object({
    email: z.string().email(),
    name: z.string().min(1),
    role: z.enum(UserRole),
    rotationOrder: z.coerce.number().int().min(0).default(0),
    notifyEnabled: z.coerce.boolean().default(false),
    notifyEmail: z.coerce.boolean().default(false),
    notifyTelegram: z.coerce.boolean().default(false),
    notifyWeekday: z.coerce.number().int().min(0).max(6).default(1),
    notifyHour: z.coerce.number().int().min(0).max(23).default(7),
    notifyMinute: z.coerce
      .number()
      .int()
      .min(0)
      .max(59)
      .multipleOf(5)
      .default(0),
    telegramChatId: z.string().optional(),
  })
  .refine((data) => !data.notifyEnabled || data.notifyEmail || data.notifyTelegram, {
    message: "Bitte mindestens einen Benachrichtigungskanal auswählen.",
    path: ["notifyEmail"],
  })
  .refine((data) => !data.notifyEnabled || !data.notifyTelegram || data.telegramChatId, {
    message: "Telegram Chat-ID fehlt.",
    path: ["telegramChatId"],
  });

function readUserFields(formData: FormData) {
  return {
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    rotationOrder: formData.get("rotationOrder"),
    notifyEnabled: formData.get("notifyEnabled") === "on",
    notifyEmail: formData.get("notifyEmail") === "on",
    notifyTelegram: formData.get("notifyTelegram") === "on",
    notifyWeekday: formData.get("notifyWeekday"),
    notifyHour: formData.get("notifyHour"),
    notifyMinute: formData.get("notifyMinute"),
    telegramChatId: formData.get("telegramChatId") || undefined,
  };
}

export async function createUserAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await requireAdmin();
  const parsed = userSchema.safeParse(readUserFields(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };

  const password = formData.get("password");
  if (typeof password !== "string" || password.length < 8) {
    return { error: "Passwort muss mindestens 8 Zeichen lang sein." };
  }

  const passwordHash = await hash(password, bcryptRounds);

  try {
    const user = await prisma.$transaction(async (tx) => {
      // rotationOrder is a continuous insertion index, not a raw stored
      // value: make room for the new user by bumping everyone from that
      // position onward, so a new user at 0 pushes the rest back instead
      // of colliding with them.
      await tx.user.updateMany({
        where: { rotationOrder: { gte: parsed.data.rotationOrder } },
        data: { rotationOrder: { increment: 1 } },
      });
      return tx.user.create({
        data: {
          ...parsed.data,
          passwordHash,
          // Explicit CSPRNG token instead of the schema's cuid() default,
          // which is not designed to be an unguessable bearer credential.
          icalToken: randomBytes(32).toString("base64url"),
        },
      });
    });
    await logAudit(session, "CREATE", "User", user.id, { email: user.email });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "E-Mail-Adresse wird bereits verwendet." };
    }
    log.error({ err }, "Failed to create user");
    return { error: "Benutzer konnte nicht erstellt werden." };
  }

  revalidatePath("/users");
  return {};
}

export async function updateUserAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await requireAdmin();
  const id = Number(formData.get("id"));
  const parsed = userSchema.safeParse(readUserFields(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };

  const password = formData.get("password");
  const data: Record<string, unknown> = { ...parsed.data };
  if (typeof password === "string" && password.length > 0) {
    if (password.length < 8) return { error: "Passwort muss mindestens 8 Zeichen lang sein." };
    data.passwordHash = await hash(password, bcryptRounds);
  }

  try {
    await prisma.user.update({ where: { id }, data });
    await logAudit(session, "UPDATE", "User", id, { email: parsed.data.email });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "E-Mail-Adresse wird bereits verwendet." };
    }
    log.error({ err, userId: id }, "Failed to update user");
    return { error: "Benutzer konnte nicht gespeichert werden." };
  }

  revalidatePath("/users");
  return {};
}

export async function toggleActiveAction(id: number, isActive: boolean): Promise<void> {
  const session = await requireAdmin();
  // Reactivating clears a previous exit date — the user is employed again.
  await prisma.user.update({ where: { id }, data: { isActive, exitDate: isActive ? null : undefined } });
  await logAudit(session, "UPDATE", "User", id, { isActive });
  revalidatePath("/users");
}

const exitDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Austrittsdatum.")
  .refine(
    (s) => {
      const d = parseDate(s);
      return !!d && toDateString(d) === s;
    },
    { message: "Ungültiges Austrittsdatum." }
  );

export async function terminateUserAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await requireAdmin();
  const id = Number(formData.get("id"));
  const parsedDate = exitDateSchema.safeParse(formData.get("exitDate"));
  if (!parsedDate.success) return { error: parsedDate.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const exitDate = parsedDate.data;
  const regenerate = formData.get("regenerateRotation") === "on";

  // Entries up to and including the exit date are the user's real duty
  // history and must survive; only future entries are cleared.
  const futureEntries = await prisma.entry.findMany({
    where: { userId: id, date: { gt: exitDate } },
    select: { date: true },
  });
  const years = [...new Set(futureEntries.map((e) => e.date.slice(0, 4)))];

  await prisma.$transaction([
    prisma.entry.deleteMany({ where: { userId: id, date: { gt: exitDate } } }),
    prisma.user.update({ where: { id }, data: { isActive: false, exitDate } }),
  ]);

  await logAudit(session, "TERMINATE", "User", id, {
    exitDate,
    deletedEntries: futureEntries.length,
  });

  revalidatePath("/users");
  for (const year of years) {
    revalidatePath(`/calendar/${year}`);
    notifyCalendarChange(year);
  }

  // Re-running the rotation is optional: the admin may prefer to reassign
  // the vacated S-Dienst weeks by hand instead.
  if (regenerate) {
    for (const year of years) {
      await generateAutomationAction(Number(year));
    }
  }

  return {};
}

/**
 * Lets an admin test a user's notification channel from the create/edit
 * dialog using the currently typed-in email/Telegram chat ID, without first
 * saving the form — mirrors `sendTestNotificationAction` in `app/(app)/actions.ts`,
 * but targets the edited user's address instead of the caller's own.
 */
export async function sendUserTestNotificationAction(
  channel: NotifyChannel,
  name: string,
  target: string
): Promise<{ error?: string; success?: boolean }> {
  const session = await requireAdmin();

  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  if (!settings) return { error: "Systemeinstellungen fehlen. Bitte einen Admin kontaktieren." };

  const channelLabel = channel === "Email" ? "E-Mail" : "Telegram";
  const subject = "Sanitätsplaner: Test-Benachrichtigung";
  const body = `Hallo ${name}\n\nDies ist eine Test-Benachrichtigung des Sanitätsplaners. Wenn du diese Nachricht erhältst, funktioniert dein Kanal (${channelLabel}).`;

  try {
    if (channel === "Email") {
      await sendPlanEmail(settings, target, subject, body);
    } else {
      await sendTelegramMessage(settings, target, body);
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Versand fehlgeschlagen." };
  }

  await logAudit(session, "SETTINGS", "User", undefined, { action: "testUserNotification", channel, target });
  return { success: true };
}
