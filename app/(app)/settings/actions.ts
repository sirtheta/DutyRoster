"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import nodemailer from "nodemailer";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { queueDueNotifications, dispatchPendingNotifications } from "@/lib/notifications";
import { verifyTelegramBotToken } from "@/lib/telegram";

const settingsSchema = z.object({
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().int().optional(),
  smtpUser: z.string().optional(),
  smtpFromName: z.string().optional(),
  smtpFromAddress: z.string().optional(),
  telegramBotToken: z.string().optional(),
});

export async function updateSettingsAction(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const session = await requireAdmin();
  const parsed = settingsSchema.safeParse({
    smtpHost: formData.get("smtpHost") || undefined,
    smtpPort: formData.get("smtpPort") || undefined,
    smtpUser: formData.get("smtpUser") || undefined,
    smtpFromName: formData.get("smtpFromName") || undefined,
    smtpFromAddress: formData.get("smtpFromAddress") || undefined,
    telegramBotToken: formData.get("telegramBotToken") || undefined,
  });
  if (!parsed.success) return { error: "Ungültige Eingabe." };

  const smtpPassword = formData.get("smtpPassword");
  const data: Record<string, unknown> = { ...parsed.data };
  // Unlike secrets, a blank field here means "clear it", not "keep the stored value" —
  // zod turns "" into undefined, which Prisma silently ignores on update, so coerce explicitly.
  data.smtpFromAddress = parsed.data.smtpFromAddress ?? null;
  if (typeof smtpPassword === "string" && smtpPassword.length > 0) {
    data.smtpPassword = encryptSecret(smtpPassword);
  }
  if (typeof parsed.data.telegramBotToken === "string" && parsed.data.telegramBotToken.length > 0) {
    data.telegramBotToken = encryptSecret(parsed.data.telegramBotToken);
  } else {
    delete data.telegramBotToken;
  }

  await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });
  await logAudit(session, "SETTINGS", "Settings", 1);

  revalidatePath("/settings");
  return { success: true };
}

/** Verifies SMTP connectivity/auth with the (possibly unsaved) form values, without sending an email. */
export async function testSmtpConnectionAction(
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  await requireAdmin();

  const host = formData.get("smtpHost");
  const user = formData.get("smtpUser");
  const portRaw = formData.get("smtpPort");
  const passwordInput = formData.get("smtpPassword");

  if (typeof host !== "string" || !host || typeof user !== "string" || !user) {
    return { error: "Host und Benutzer müssen angegeben werden." };
  }

  let password: string;
  if (typeof passwordInput === "string" && passwordInput.length > 0) {
    password = passwordInput;
  } else {
    const existing = await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { smtpPassword: true },
    });
    if (!existing?.smtpPassword) {
      return { error: "Kein Passwort hinterlegt. Bitte Passwort eingeben." };
    }
    password = decryptSecret(existing.smtpPassword);
  }

  const port = typeof portRaw === "string" && portRaw ? Number(portRaw) : 587;
  if (!Number.isInteger(port)) return { error: "Ungültiger Port." };

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password },
    });
    await transporter.verify();
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Verbindung fehlgeschlagen." };
  }
}

/** Verifies a Telegram bot token via `getMe`, using the (possibly unsaved) form value or the stored one. */
export async function testTelegramConnectionAction(
  formData: FormData
): Promise<{ error?: string; success?: boolean; botUsername?: string }> {
  await requireAdmin();

  const tokenInput = formData.get("telegramBotToken");
  let token: string;
  if (typeof tokenInput === "string" && tokenInput.length > 0) {
    token = tokenInput;
  } else {
    const existing = await prisma.systemSettings.findUnique({
      where: { id: 1 },
      select: { telegramBotToken: true },
    });
    if (!existing?.telegramBotToken) {
      return { error: "Kein Bot-Token hinterlegt. Bitte Token eingeben." };
    }
    token = decryptSecret(existing.telegramBotToken);
  }

  try {
    const { username } = await verifyTelegramBotToken(token);
    return { success: true, botUsername: username };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Verbindung fehlgeschlagen." };
  }
}

/**
 * Resets all failed, not-yet-sent notifications (attempts/failedAt/error) and
 * dispatches them immediately, so an admin can retry after fixing e.g. the
 * SMTP settings or a missing Telegram chat ID.
 */
export async function retryFailedNotificationsAction(): Promise<{
  error?: string;
  count?: number;
}> {
  const session = await requireAdmin();
  try {
    const { count } = await prisma.pendingNotification.updateMany({
      where: { sentAt: null, failedAt: { not: null } },
      data: { attempts: 0, failedAt: null, error: null },
    });
    if (count > 0) await dispatchPendingNotifications(prisma);
    await logAudit(session, "SETTINGS", "Settings", 1, {
      action: "retryFailedNotifications",
      count,
    });
    revalidatePath("/settings");
    return { count };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unbekannter Fehler" };
  }
}

/** Dev-only: runs the real notification pipeline (email + Telegram) on demand, ignoring each user's configured weekday/hour. */
export async function triggerNotificationCheck(): Promise<{ error?: string; success?: boolean; queued?: number }> {
  if (process.env.NODE_ENV === "production") {
    return { error: "Nur in Entwicklungsumgebungen verfügbar." };
  }
  const session = await requireAdmin();
  try {
    const queued = await queueDueNotifications(prisma, new Date(), { force: true });
    await dispatchPendingNotifications(prisma);
    await logAudit(session, "SETTINGS", "Settings", 1, { action: "triggerNotificationCheck", queued });
    revalidatePath("/settings");
    return { success: true, queued };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unbekannter Fehler" };
  }
}
