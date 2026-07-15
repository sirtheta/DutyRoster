import { PrismaClient, UserRole } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { faker } from "@faker-js/faker";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { datesOfYear } from "../lib/date";
import { importHolidaysForYear } from "../lib/holidays";

function createClient() {
  const url = process.env.DATABASE_URL ?? "file:./data/sanitaetsplaner.db";
  const dbPath = url.replace(/^file:/, "");
  const adapter = new PrismaBetterSqlite3({ url: dbPath });
  return new PrismaClient({ adapter });
}

const prisma = createClient();

async function ensureUsers() {
  const userCount = await prisma.user.count();
  if (userCount > 0) return [];

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const adminName = process.env.ADMIN_NAME ?? "Admin";
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

  let adminHash: string;
  if (adminPasswordHash) {
    adminHash = adminPasswordHash;
  } else {
    let plainPassword = process.env.ADMIN_PASSWORD;
    if (!plainPassword) {
      plainPassword = randomBytes(12).toString("base64url");
      console.log(`No ADMIN_PASSWORD(_HASH) set — generated admin password: ${plainPassword}`);
    }
    adminHash = await hash(plainPassword, 10);
  }

  const testHash = await hash("changeme123", 10);

  const seedUsers = [
    { email: adminEmail, name: adminName, passwordHash: adminHash, role: UserRole.Admin, rotationOrder: 0 },
    { email: "editor1@example.com", name: faker.person.fullName(), passwordHash: testHash, role: UserRole.Editor, rotationOrder: 1 },
    { email: "editor2@example.com", name: faker.person.fullName(), passwordHash: testHash, role: UserRole.Editor, rotationOrder: 2 },
    { email: "editor3@example.com", name: faker.person.fullName(), passwordHash: testHash, role: UserRole.Editor, rotationOrder: 3 },
    { email: "viewer@example.com", name: faker.person.fullName(), passwordHash: testHash, role: UserRole.Viewer, rotationOrder: 4 },
  ];

  const created = [];
  for (const user of seedUsers) {
    const u = await prisma.user.create({ data: { ...user, isActive: true } });
    console.log(`User created: ${u.email} (${u.role})`);
    created.push(u);
  }
  return created;
}

async function ensureSettings() {
  await prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
}

async function ensureHolidaysAndSampleEntries(users: { id: number; role: UserRole }[]) {
  const year = new Date().getFullYear();
  const existingHolidays = await prisma.holiday.count({ where: { year } });
  if (existingHolidays === 0) {
    const count = await importHolidaysForYear(year, "BE");
    console.log(`Imported ${count} holidays for ${year} (BE).`);
  }

  const existingEntries = await prisma.entry.count();
  if (existingEntries > 0) return;

  const editors = users.filter((u) => u.role !== UserRole.Viewer);
  if (editors.length === 0) return;

  const dates = datesOfYear(year).slice(0, 60);
  for (let i = 0; i < dates.length; i++) {
    const user = editors[Math.floor(i / 5) % editors.length];
    await prisma.entry.create({
      data: { userId: user.id, date: dates[i], type: "S", source: "Automatic" },
    });
  }
  console.log(`Created ${dates.length} sample S-Dienst entries for ${year}.`);
}

async function main() {
  const created = await ensureUsers();
  await ensureSettings();

  const users = created.length > 0 ? created : await prisma.user.findMany();
  await ensureHolidaysAndSampleEntries(users);

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
