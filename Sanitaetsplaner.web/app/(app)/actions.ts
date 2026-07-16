"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { signOut } from "@/lib/auth";
import { requireSession } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import prisma from "@/lib/prisma";

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
