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
  fd.set("notifyChannel", "Email");
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

  it("rejects creating a user with a too-short password", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { createUserAction } = await import("@/app/(app)/users/actions");
    const res = await createUserAction(undefined, userFormData({ password: "short" }));

    expect(res.error).toMatch(/Passwort/);
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
});
