import { createHash, randomBytes } from "crypto";
import type { PrismaClient } from "@prisma/client";

/** How long a reset link stays valid. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** SHA-256 hex digest of a raw reset token (only the hash is stored). */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a fresh reset token for a user, replacing any previous ones so at
 * most one link is valid at a time. Returns the raw token for the email link;
 * the database only ever sees its hash.
 */
export async function createPasswordResetToken(
  prisma: PrismaClient,
  userId: number,
  now = new Date()
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      },
    }),
  ]);
  return token;
}

/**
 * Validates a raw token and marks it used. Returns the owning userId, or
 * null when the token is unknown, expired, or already used.
 */
export async function consumePasswordResetToken(
  prisma: PrismaClient,
  token: string,
  now = new Date()
): Promise<number | null> {
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
  });
  if (!row || row.usedAt || row.expiresAt < now) return null;
  await prisma.passwordResetToken.update({
    where: { id: row.id },
    data: { usedAt: now },
  });
  return row.userId;
}
