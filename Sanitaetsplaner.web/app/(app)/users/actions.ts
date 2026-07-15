"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { bcryptRounds } from "@/lib/password";
import { UserRole, NotifyChannel } from "@prisma/client";

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(UserRole),
  rotationOrder: z.coerce.number().int().default(0),
  notifyEnabled: z.coerce.boolean().default(false),
  notifyChannel: z.enum(NotifyChannel).default("Email"),
  notifyWeekday: z.coerce.number().int().min(0).max(6).default(1),
  notifyHour: z.coerce.number().int().min(0).max(23).default(7),
  telegramChatId: z.string().optional(),
});

function readUserFields(formData: FormData) {
  return {
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    rotationOrder: formData.get("rotationOrder"),
    notifyEnabled: formData.get("notifyEnabled") === "on",
    notifyChannel: formData.get("notifyChannel"),
    notifyWeekday: formData.get("notifyWeekday"),
    notifyHour: formData.get("notifyHour"),
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

  try {
    const user = await prisma.user.create({
      data: { ...parsed.data, passwordHash: await hash(password, bcryptRounds) },
    });
    await logAudit(session, "CREATE", "User", user.id, { email: user.email });
  } catch {
    return { error: "E-Mail-Adresse wird bereits verwendet." };
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
  } catch {
    return { error: "E-Mail-Adresse wird bereits verwendet." };
  }

  revalidatePath("/users");
  return {};
}

export async function toggleActiveAction(id: number, isActive: boolean): Promise<void> {
  const session = await requireAdmin();
  await prisma.user.update({ where: { id }, data: { isActive } });
  await logAudit(session, "UPDATE", "User", id, { isActive });
  revalidatePath("/users");
}
