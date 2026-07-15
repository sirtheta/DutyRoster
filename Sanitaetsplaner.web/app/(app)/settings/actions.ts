"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";

const settingsSchema = z.object({
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().int().optional(),
  smtpUser: z.string().optional(),
  smtpFromName: z.string().optional(),
  telegramBotToken: z.string().optional(),
  rotationBlockSize: z.coerce.number().int().min(1).default(5),
  defaultCanton: z.string().min(2).max(2).default("BE"),
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
    telegramBotToken: formData.get("telegramBotToken") || undefined,
    rotationBlockSize: formData.get("rotationBlockSize"),
    defaultCanton: formData.get("defaultCanton"),
  });
  if (!parsed.success) return { error: "Ungültige Eingabe." };

  const smtpPassword = formData.get("smtpPassword");
  const data: Record<string, unknown> = { ...parsed.data };
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
