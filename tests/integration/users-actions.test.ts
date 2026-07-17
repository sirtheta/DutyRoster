import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import { compare } from "bcryptjs";
import { createTestDatabase, createTestUser } from "../test-utils";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const db = createTestDatabase();
vi.mock("@/lib/prisma", () => ({ get default() { return db.prisma; } }));

let currentSession: Session;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => currentSession) }));

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

function sessionFor(userId: number, role: "Admin" | "Editor" | "Viewer"): Session {
  return { user: { id: String(userId), name: "Test", email: "test@example.com", role }, expires: "2099-01-01" } as Session;
}

function userFormData(fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("email", "new@example.com");
  fd.set("name", "New User");
  fd.set("role", "Editor");
  fd.set("notifyEmail", "on");
  fd.set("password", "password123");
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("users actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a non-admin from creating a user", async () => {
    const editor = await db.prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    currentSession = sessionFor(editor.id, "Editor");

    const { createUserAction } = await import("@/app/(app)/users/actions");
    await expect(createUserAction(undefined, userFormData())).rejects.toThrow("REDIRECT:/calendar");
  });

  it("creates a user with a hashed password and a random iCal token, and logs an audit entry", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { createUserAction } = await import("@/app/(app)/users/actions");
    const res = await createUserAction(undefined, userFormData());

    expect(res.error).toBeUndefined();
    const created = await db.prisma.user.findUniqueOrThrow({ where: { email: "new@example.com" } });
    expect(created.passwordHash).not.toBe("password123");
    expect(await compare("password123", created.passwordHash)).toBe(true);
    expect(created.icalToken).toBeTruthy();
    const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { entityType: "User", action: "CREATE" } });
    expect(audit.entityId).toBe(created.id);
  });

  it("shifts existing users back when a new user is inserted at their rotation position", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin", rotationOrder: 0 }) });
    const second = await db.prisma.user.create({
      data: createTestUser({ email: "second@example.com", rotationOrder: 1 }),
    });
    currentSession = sessionFor(admin.id, "Admin");

    const { createUserAction } = await import("@/app/(app)/users/actions");
    const res = await createUserAction(undefined, userFormData({ rotationOrder: "0" }));

    expect(res.error).toBeUndefined();
    const created = await db.prisma.user.findUniqueOrThrow({ where: { email: "new@example.com" } });
    expect(created.rotationOrder).toBe(0);
    expect((await db.prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).rotationOrder).toBe(1);
    expect((await db.prisma.user.findUniqueOrThrow({ where: { id: second.id } })).rotationOrder).toBe(2);
  });

  it("rejects creating a user with a too-short password", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { createUserAction } = await import("@/app/(app)/users/actions");
    const res = await createUserAction(undefined, userFormData({ password: "short" }));

    expect(res.error).toMatch(/Passwort/);
  });

  it("rejects creating a user with a negative rotation order", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { createUserAction } = await import("@/app/(app)/users/actions");
    const res = await createUserAction(undefined, userFormData({ rotationOrder: "-1" }));

    expect(res.error).toBeTruthy();
    await expect(db.prisma.user.findUnique({ where: { email: "new@example.com" } })).resolves.toBeNull();
  });

  it("rejects creating a user with invalid input", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { createUserAction } = await import("@/app/(app)/users/actions");
    const res = await createUserAction(undefined, userFormData({ email: "not-an-email" }));

    expect(res.error).toBeTruthy();
  });

  it("rejects creating a user with a duplicate email", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin", email: "dup@example.com" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { createUserAction } = await import("@/app/(app)/users/actions");
    const res = await createUserAction(undefined, userFormData({ email: "dup@example.com" }));

    expect(res.error).toBe("E-Mail-Adresse wird bereits verwendet.");
  });

  it("updates a user's email without touching the password when none is given", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    const target = await db.prisma.user.create({ data: createTestUser({ email: "old@example.com" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { updateUserAction } = await import("@/app/(app)/users/actions");
    const fd = userFormData({ email: "updated@example.com" });
    fd.set("id", String(target.id));
    fd.delete("password");
    const res = await updateUserAction(undefined, fd);

    expect(res.error).toBeUndefined();
    const updated = await db.prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.email).toBe("updated@example.com");
    expect(updated.passwordHash).toBe(target.passwordHash);
  });

  it("updates a user's password when a new one is given", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    const target = await db.prisma.user.create({ data: createTestUser({ email: "old@example.com" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { updateUserAction } = await import("@/app/(app)/users/actions");
    const fd = userFormData({ email: "old@example.com", password: "newpassword1" });
    fd.set("id", String(target.id));
    const res = await updateUserAction(undefined, fd);

    expect(res.error).toBeUndefined();
    const updated = await db.prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(await compare("newpassword1", updated.passwordHash)).toBe(true);
  });

  it("rejects updating a user with a too-short new password", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    const target = await db.prisma.user.create({ data: createTestUser({ email: "old@example.com" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { updateUserAction } = await import("@/app/(app)/users/actions");
    const fd = userFormData({ email: "old@example.com", password: "short" });
    fd.set("id", String(target.id));
    const res = await updateUserAction(undefined, fd);

    expect(res.error).toMatch(/Passwort/);
  });

  it("rejects updating a user to an email that is already taken", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin", email: "admin@example.com" }) });
    await db.prisma.user.create({ data: createTestUser({ email: "taken@example.com" }) });
    const target = await db.prisma.user.create({ data: createTestUser({ email: "free@example.com" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { updateUserAction } = await import("@/app/(app)/users/actions");
    const fd = userFormData({ email: "taken@example.com" });
    fd.set("id", String(target.id));
    fd.delete("password");
    const res = await updateUserAction(undefined, fd);

    expect(res.error).toBe("E-Mail-Adresse wird bereits verwendet.");
  });

  it("toggles a user's active state and logs an audit entry", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    const target = await db.prisma.user.create({ data: createTestUser({ email: "target@example.com", isActive: true }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { toggleActiveAction } = await import("@/app/(app)/users/actions");
    await toggleActiveAction(target.id, false);

    const updated = await db.prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.isActive).toBe(false);
    const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { entityType: "User", action: "UPDATE" } });
    expect(JSON.parse(audit.details!)).toMatchObject({ isActive: false });
  });

  it("reactivating a user clears a previously set exit date", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    const target = await db.prisma.user.create({
      data: createTestUser({ email: "target@example.com", isActive: false, exitDate: "2026-06-15" }),
    });
    currentSession = sessionFor(admin.id, "Admin");

    const { toggleActiveAction } = await import("@/app/(app)/users/actions");
    await toggleActiveAction(target.id, true);

    const updated = await db.prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.isActive).toBe(true);
    expect(updated.exitDate).toBeNull();
  });

  function terminateFormData(id: number, exitDate: string, regenerate = false): FormData {
    const fd = new FormData();
    fd.set("id", String(id));
    fd.set("exitDate", exitDate);
    if (regenerate) fd.set("regenerateRotation", "on");
    return fd;
  }

  it("rejects a non-admin from terminating a user", async () => {
    const editor = await db.prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    currentSession = sessionFor(editor.id, "Editor");

    const { terminateUserAction } = await import("@/app/(app)/users/actions");
    await expect(terminateUserAction(undefined, terminateFormData(editor.id, "2026-06-15"))).rejects.toThrow(
      "REDIRECT:/calendar"
    );
  });

  it("rejects an invalid exit date", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    const target = await db.prisma.user.create({ data: createTestUser({ email: "target@example.com" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { terminateUserAction } = await import("@/app/(app)/users/actions");
    const res = await terminateUserAction(undefined, terminateFormData(target.id, "not-a-date"));

    expect(res.error).toMatch(/Austrittsdatum/);
  });

  it("removes only entries after the exit date, deactivates the user, and logs an audit entry", async () => {
    const { prisma } = db;
    const admin = await prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    const target = await prisma.user.create({ data: createTestUser({ email: "target@example.com" }) });
    await prisma.entry.create({ data: { userId: target.id, date: "2026-01-05", type: "S" } });
    await prisma.entry.create({ data: { userId: target.id, date: "2026-06-15", type: "F" } });
    await prisma.entry.create({ data: { userId: target.id, date: "2026-09-10", type: "S" } });
    currentSession = sessionFor(admin.id, "Admin");

    const { terminateUserAction } = await import("@/app/(app)/users/actions");
    const res = await terminateUserAction(undefined, terminateFormData(target.id, "2026-06-15"));

    expect(res.error).toBeUndefined();
    const remaining = await prisma.entry.findMany({ where: { userId: target.id }, orderBy: { date: "asc" } });
    expect(remaining.map((e) => e.date)).toEqual(["2026-01-05", "2026-06-15"]);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.isActive).toBe(false);
    expect(updated.exitDate).toBe("2026-06-15");

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityType: "User", action: "TERMINATE" } });
    expect(JSON.parse(audit.details!)).toMatchObject({ exitDate: "2026-06-15", deletedEntries: 1 });

    // Rotation regeneration is opt-in — no automation entries without it.
    expect(await prisma.entry.count({ where: { source: "Automatic" } })).toBe(0);
  });

  it("regenerates the rotation for the affected year only when requested", async () => {
    const { prisma } = db;
    const admin = await prisma.user.create({ data: createTestUser({ role: "Admin", rotationOrder: 1 }) });
    const target = await prisma.user.create({
      data: createTestUser({ email: "target@example.com", rotationOrder: 0 }),
    });
    const futureDate = "2026-09-14"; // a Monday
    await prisma.entry.create({ data: { userId: target.id, date: futureDate, type: "S", source: "Automatic" } });
    currentSession = sessionFor(admin.id, "Admin");

    const { terminateUserAction } = await import("@/app/(app)/users/actions");
    await terminateUserAction(undefined, terminateFormData(target.id, "2026-06-15", true));

    // target is now inactive; admin is the only remaining rotation
    // participant and should have picked up the vacated week.
    const adminEntry = await prisma.entry.findUnique({
      where: { userId_date: { userId: admin.id, date: futureDate } },
    });
    expect(adminEntry?.type).toBe("S");
    expect(adminEntry?.source).toBe("Automatic");
  });
});
