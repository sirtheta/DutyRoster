"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { NotifyChannel } from "@prisma/client";
import { signOut } from "@/lib/auth";
import { requireSession } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bcryptRounds } from "@/lib/password";
import { sendPlanEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
import prisma from "@/lib/prisma";

const notificationSettingsSchema = z.object({
  notifyEnabled: z.coerce.boolean().default(false),
  notifyChannel: z.enum(NotifyChannel).default("Email"),
  notifyWeekday: z.coerce.number().int().min(0).max(6).default(1),
  notifyHour: z.coerce.number().int().min(0).max(23).default(7),
  telegramChatId: z.string().optional(),
});

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

/**
 * Rotates the caller's own iCal token. Calendar-subscription URLs leak easily
 * (referrer logs, forwarded mails, calendar account access), so users need a
 * way to invalidate the old link.
 */
export async function regenerateIcalTokenAction(): Promise<{ error?: string }> {
  const session = await requireSession();
  const userId = parseInt(session.user.id, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { icalToken: randomBytes(32).toString("base64url") },
  });
  await logAudit(session, "UPDATE", "User", userId, { action: "regenerateIcalToken" });
  revalidatePath("/dashboard");
  return {};
}

/**
 * Toggles whether the caller's own iCal feed includes Ferien (F) entries in
 * addition to S-Dienst. Lives next to regenerateIcalTokenAction since both
 * are self-service iCal feed settings on the dashboard.
 */
export async function updateIcalIncludeVacationAction(includeVacation: boolean): Promise<{ error?: string }> {
  const session = await requireSession();
  const userId = parseInt(session.user.id, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { icalIncludeVacation: includeVacation },
  });
  await logAudit(session, "UPDATE", "User", userId, { action: "updateIcalIncludeVacation", includeVacation });
  revalidatePath("/dashboard");
  return {};
}

export async function changeOwnPasswordAction(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const session = await requireSession();
  const userId = parseInt(session.user.id, 10);

  const currentPassword = formData.get("currentPassword");
  const newPassword = formData.get("newPassword");
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return { error: "Ungültige Eingabe." };
  }
  if (newPassword.length < 8) {
    return { error: "Neues Passwort muss mindestens 8 Zeichen lang sein." };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await compare(currentPassword, user.passwordHash))) {
    return { error: "Aktuelles Passwort ist falsch." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hash(newPassword, bcryptRounds) },
  });
  await logAudit(session, "UPDATE", "User", userId, { action: "changeOwnPassword" });
  return { success: true };
}

/**
 * Self-service notification settings. Every role can reach this (unlike
 * /users, which is Admin-only), since a user must be able to control how
 * they get pinged about their own S-Dienst without needing an admin to do it.
 */
export async function updateOwnNotificationSettingsAction(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const session = await requireSession();
  const userId = parseInt(session.user.id, 10);

  const parsed = notificationSettingsSchema.safeParse({
    notifyEnabled: formData.get("notifyEnabled") === "on",
    notifyChannel: formData.get("notifyChannel"),
    notifyWeekday: formData.get("notifyWeekday"),
    notifyHour: formData.get("notifyHour"),
    telegramChatId: formData.get("telegramChatId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };

  if (parsed.data.notifyEnabled && parsed.data.notifyChannel === "Telegram" && !parsed.data.telegramChatId) {
    return { error: "Telegram Chat-ID fehlt." };
  }

  await prisma.user.update({ where: { id: userId }, data: parsed.data });
  await logAudit(session, "UPDATE", "User", userId, { action: "updateOwnNotificationSettings" });
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Sends a one-off test notification through the given channel so a user can
 * verify their setup (SMTP reachability, correct Telegram chat ID) before —
 * or independently of — saving it as their configured channel.
 */
export async function sendTestNotificationAction(
  channel: NotifyChannel,
  telegramChatId?: string
): Promise<{ error?: string; success?: boolean }> {
  const session = await requireSession();
  const userId = parseInt(session.user.id, 10);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Benutzer nicht gefunden." };

  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  if (!settings) return { error: "Systemeinstellungen fehlen. Bitte einen Admin kontaktieren." };

  const channelLabel = channel === "Email" ? "E-Mail" : "Telegram";
  const subject = "Sanitätsplaner: Test-Benachrichtigung";
  const body = `Hallo ${user.name}\n\nDies ist eine Test-Benachrichtigung des Sanitätsplaners. Wenn du diese Nachricht erhältst, funktioniert dein Kanal (${channelLabel}).`;

  try {
    if (channel === "Email") {
      await sendPlanEmail(settings, user.email, subject, body);
    } else {
      if (!telegramChatId) return { error: "Telegram Chat-ID fehlt." };
      await sendTelegramMessage(settings, telegramChatId, body);
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Versand fehlgeschlagen." };
  }

  await logAudit(session, "SETTINGS", "User", userId, { action: "testNotification", channel });
  return { success: true };
}
