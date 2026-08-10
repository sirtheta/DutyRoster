"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { NotifyChannel } from "@prisma/client";
import { signOut } from "@/lib/auth";
import { requireSession } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bcryptRounds, passwordSchema } from "@/lib/password";
import { sendPlanEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
import {
  generateTwoFactorSecret,
  generateTwoFactorSetup,
  encryptTwoFactorSecret,
  verifyTotpCode,
} from "@/lib/two-factor";
import { generateBackupCodes, hashBackupCodes } from "@/lib/backup-codes";
import { decryptSecret } from "@/lib/crypto";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";

const log = logger.child({ module: "account" });

const notificationSettingsSchema = z.object({
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
  const parsedPassword = passwordSchema.safeParse(newPassword);
  if (!parsedPassword.success) {
    return { error: parsedPassword.error.issues[0]?.message ?? "Ungültiges Passwort." };
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
    notifyEmail: formData.get("notifyEmail") === "on",
    notifyTelegram: formData.get("notifyTelegram") === "on",
    notifyWeekday: formData.get("notifyWeekday"),
    notifyHour: formData.get("notifyHour"),
    notifyMinute: formData.get("notifyMinute"),
    telegramChatId: formData.get("telegramChatId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };

  if (parsed.data.notifyEnabled && !parsed.data.notifyEmail && !parsed.data.notifyTelegram) {
    return { error: "Bitte mindestens einen Kanal auswählen." };
  }
  if (parsed.data.notifyEnabled && parsed.data.notifyTelegram && !parsed.data.telegramChatId) {
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
    log.error({ err, userId, channel }, "Failed to send test notification");
    return { error: err instanceof Error ? err.message : "Versand fehlgeschlagen." };
  }

  await logAudit(session, "SETTINGS", "User", userId, { action: "testNotification", channel });
  return { success: true };
}

/**
 * Starts (or restarts) 2FA setup for the caller: generates a fresh secret,
 * stores it encrypted right away (twoFactorEnabled stays false until
 * `confirmTwoFactorSetupAction` verifies a code from it), and returns the QR
 * code / manual-entry secret for the authenticator app.
 */
export async function startTwoFactorSetupAction(): Promise<{
  error?: string;
  qrDataUrl?: string;
  secret?: string;
}> {
  const session = await requireSession();
  const userId = parseInt(session.user.id, 10);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Benutzer nicht gefunden." };

  const secret = generateTwoFactorSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: encryptTwoFactorSecret(secret) },
  });
  const { qrDataUrl } = await generateTwoFactorSetup(user.email, secret);
  return { qrDataUrl, secret };
}

/**
 * Confirms 2FA setup with a code generated from the pending secret. On
 * success, enables 2FA and issues a fresh set of backup codes (shown once).
 */
export async function confirmTwoFactorSetupAction(
  _prevState: { error?: string; success?: boolean; backupCodes?: string[] } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: boolean; backupCodes?: string[] }> {
  const session = await requireSession();
  const userId = parseInt(session.user.id, 10);

  const code = formData.get("code");
  if (typeof code !== "string" || !code.trim()) return { error: "Bitte einen Code eingeben." };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.twoFactorSecret) return { error: "Kein 2FA-Setup gestartet." };

  const valid = verifyTotpCode(decryptSecret(user.twoFactorSecret), code);
  if (!valid) return { error: "Ungültiger Code." };

  const backupCodes = generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true, twoFactorBackupCodes: JSON.stringify(hashBackupCodes(backupCodes)) },
  });
  await logAudit(session, "UPDATE", "User", userId, { action: "enableTwoFactor" });
  revalidatePath("/", "layout");
  return { success: true, backupCodes };
}

/**
 * Disables 2FA for the caller. Requires the current password (not a 2FA
 * code) so it still works if the authenticator device/app was lost.
 */
export async function disableTwoFactorAction(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const session = await requireSession();
  const userId = parseInt(session.user.id, 10);

  const password = formData.get("password");
  if (typeof password !== "string") return { error: "Ungültige Eingabe." };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await compare(password, user.passwordHash))) {
    return { error: "Passwort ist falsch." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null },
  });
  await logAudit(session, "UPDATE", "User", userId, { action: "disableTwoFactor" });
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Regenerates the caller's backup codes, invalidating all previous ones.
 * Requires the current password, same rationale as disabling.
 */
export async function regenerateBackupCodesAction(
  _prevState: { error?: string; success?: boolean; backupCodes?: string[] } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: boolean; backupCodes?: string[] }> {
  const session = await requireSession();
  const userId = parseInt(session.user.id, 10);

  const password = formData.get("password");
  if (typeof password !== "string") return { error: "Ungültige Eingabe." };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await compare(password, user.passwordHash))) {
    return { error: "Passwort ist falsch." };
  }
  if (!user.twoFactorEnabled) return { error: "2FA ist nicht aktiviert." };

  const backupCodes = generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorBackupCodes: JSON.stringify(hashBackupCodes(backupCodes)) },
  });
  await logAudit(session, "UPDATE", "User", userId, { action: "regenerateBackupCodes" });
  return { success: true, backupCodes };
}
