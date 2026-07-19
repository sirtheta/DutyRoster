/**
 * Seeds a fixed, fictional demo instance used to capture screenshots for
 * public/benutzerhandbuch.html. Deterministic (no faker) so re-running it
 * reproduces the same roster and lets old and new screenshots stay visually
 * consistent. See scripts/manual-screenshots.ts for how to use it together
 * with the capture script.
 *
 * Run against its own DB, never the dev database:
 *   npx prisma db push --schema prisma/schema.prisma  (against DATABASE_URL below)
 *   DATABASE_URL=file:./data/demo-manual.db ENCRYPTION_KEY=<any 32+ chars> \
 *     npx tsx scripts/seed-manual-demo.ts
 */
import { PrismaClient, UserRole, EntryType, SwapRequestStatus } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { hash } from "bcryptjs";
import { randomUUID } from "crypto";
import { runRotation } from "../lib/rotation";
import { weekRange } from "../lib/week";

function createClient() {
  const url = process.env.DATABASE_URL ?? "file:./data/demo-manual.db";
  const dbPath = url.replace(/^file:/, "");
  const adapter = new PrismaBetterSqlite3({ url: dbPath });
  return new PrismaClient({ adapter });
}

// Minimal AES-256-GCM encrypt matching lib/crypto.ts (kept independent so this
// throwaway script has no "@/" alias dependency).
import { createCipheriv, randomBytes, scryptSync } from "crypto";
function encryptSecret(plain: string): string {
  const key = scryptSync(process.env.ENCRYPTION_KEY ?? "insecure-development-encryption-key", "DutyRoster-secret-encryption-v1", 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

const prisma = createClient();

async function main() {
  const passwordHash = await hash("Demo1234!", 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@demo.local",
      name: "Sandra Baumann",
      passwordHash,
      role: UserRole.Admin,
      rotationOrder: 0,
      icalToken: "demo-token-admin",
      notifyEnabled: true,
      notifyEmail: true,
      notifyTelegram: false,
      notifyWeekday: 1,
      notifyHour: 7,
      notifyMinute: 0,
    },
  });

  const rotationUsers = [
    { name: "Marco Keller", email: "editor@demo.local", role: UserRole.Editor, rotationOrder: 1, notify: { enabled: true, email: true, telegram: false } },
    { name: "Léa Fischer", email: "lea.fischer@demo.local", role: UserRole.Editor, rotationOrder: 2, notify: { enabled: true, email: true, telegram: true } },
    { name: "Tobias Meier", email: "tobias.meier@demo.local", role: UserRole.Editor, rotationOrder: 3, notify: { enabled: false, email: true, telegram: false } },
    { name: "Nina Schneider", email: "nina.schneider@demo.local", role: UserRole.Editor, rotationOrder: 4, notify: { enabled: false, email: true, telegram: false } },
    { name: "Urs Zbinden", email: "urs.zbinden@demo.local", role: UserRole.Editor, rotationOrder: 5, notify: { enabled: false, email: true, telegram: false } },
    { name: "Petra Gerber", email: "petra.gerber@demo.local", role: UserRole.Viewer, rotationOrder: 6, notify: { enabled: false, email: true, telegram: false } },
    { name: "Daniel Roth", email: "daniel.roth@demo.local", role: UserRole.Viewer, rotationOrder: 7, notify: { enabled: false, email: true, telegram: false } },
  ];

  const created: Record<string, { id: number; name: string }> = { "Sandra Baumann": admin };
  for (const u of rotationUsers) {
    const user = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash,
        role: u.role,
        rotationOrder: u.rotationOrder,
        notifyEnabled: u.notify.enabled,
        notifyEmail: u.notify.email,
        notifyTelegram: u.notify.telegram,
        notifyWeekday: 1,
        notifyHour: 7,
        notifyMinute: 0,
      },
    });
    created[u.name] = user;
  }

  const beat = await prisma.user.create({
    data: {
      email: "ehemalig@demo.local",
      name: "Beat Hodel",
      passwordHash,
      role: UserRole.Editor,
      rotationOrder: 8,
      isActive: false,
      exitDate: "2026-03-31",
    },
  });
  created["Beat Hodel"] = beat;

  await prisma.systemSettings.create({
    data: {
      id: 1,
      smtpHost: "smtp.office365.com",
      smtpPort: 587,
      smtpUser: "sanitaetsplaner@firma-demo.ch",
      smtpPassword: encryptSecret("super-secret-demo-password"),
      smtpFromName: "Sanitätsplaner",
      smtpFromAddress: "info@firma-demo.ch",
      telegramBotToken: encryptSecret("123456789:AAdemoTokenNotReal"),
    },
  });

  // Full-year rotation for 2026, admin excluded from the duty queue.
  const rotationInput = rotationUsers.map((u) => ({ userId: created[u.name].id, rotationOrder: u.rotationOrder }));
  const { assignments } = runRotation({
    year: 2026,
    users: rotationInput,
    holidays: new Set(),
    blockedDates: new Map(),
    occupiedDates: new Set(),
  });

  await prisma.entry.createMany({
    data: assignments.map((a) => ({ userId: a.userId, date: a.date, type: EntryType.S, source: "Automatic" })),
  });

  // Group assignments by week to find real S-Dienst weeks for the swap-request demo.
  const byUser = new Map<number, string[]>();
  for (const a of assignments) {
    if (!byUser.has(a.userId)) byUser.set(a.userId, []);
    byUser.get(a.userId)!.push(a.date);
  }
  function weeksFor(userId: number) {
    const dates = (byUser.get(userId) ?? []).sort();
    const weeks = new Map<string, string[]>();
    for (const d of dates) {
      const { start } = weekRange(new Date(d + "T00:00:00"));
      if (!weeks.has(start)) weeks.set(start, []);
      weeks.get(start)!.push(d);
    }
    return [...weeks.entries()].filter(([start]) => start > "2026-07-19").sort(([a], [b]) => a.localeCompare(b));
  }

  const marco = created["Marco Keller"];
  const marcoWeeks = weeksFor(marco.id);
  const marcoOfferWeek = marcoWeeks[1] ?? marcoWeeks[0]; // an upcoming week, not the very next

  // Find another colleague's upcoming week (not Marco's) for the incoming request to Marco.
  let incomingFrom: { id: number; name: string } | null = null;
  let incomingWeek: string[] | null = null;
  for (const u of rotationUsers) {
    if (u.name === "Marco Keller") continue;
    const weeks = weeksFor(created[u.name].id);
    if (weeks.length > 0) {
      incomingFrom = created[u.name];
      incomingWeek = weeks[0][1];
      break;
    }
  }

  if (incomingFrom && incomingWeek) {
    await prisma.swapRequest.create({
      data: {
        fromUserId: incomingFrom.id,
        toUserId: marco.id,
        dates: JSON.stringify(incomingWeek),
        comment: "Kollision mit Familienfest, kannst du tauschen?",
        status: SwapRequestStatus.Pending,
      },
    });
  }

  if (marcoOfferWeek) {
    const groupId = randomUUID();
    const others = rotationUsers.filter((u) => u.name !== "Marco Keller").map((u) => created[u.name]);
    await prisma.swapRequest.createMany({
      data: [admin, ...others].map((u) => ({
        fromUserId: marco.id,
        toUserId: u.id,
        dates: JSON.stringify(marcoOfferWeek[1]),
        comment: null,
        status: SwapRequestStatus.Pending,
        groupId,
      })),
    });
  }

  console.log("Demo seed complete.");
  console.log("Marco offer week:", marcoOfferWeek?.[1]);
  console.log("Incoming from:", incomingFrom?.name, incomingWeek);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
