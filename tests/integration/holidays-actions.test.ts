import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
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

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("holidays actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a non-admin from creating a holiday", async () => {
    const editor = await db.prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    currentSession = sessionFor(editor.id, "Editor");

    const { createHolidayAction } = await import("@/app/(app)/holidays/actions");
    await expect(
      createHolidayAction(undefined, formData({ date: "2026-08-01", name: "Test" }))
    ).rejects.toThrow("REDIRECT:/calendar");
  });

  it("creates a single holiday and logs an audit entry", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { createHolidayAction } = await import("@/app/(app)/holidays/actions");
    const res = await createHolidayAction(undefined, formData({ date: "2026-08-01", name: "Test-Feiertag" }));

    expect(res.error).toBeUndefined();
    const holiday = await db.prisma.holiday.findFirstOrThrow({ where: { date: "2026-08-01" } });
    expect(holiday.name).toBe("Test-Feiertag");
    expect(holiday.year).toBe(2026);
    const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { entityType: "Holiday" } });
    expect(audit.action).toBe("CREATE");
  });

  it("rejects invalid input for a single holiday", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { createHolidayAction } = await import("@/app/(app)/holidays/actions");
    const res = await createHolidayAction(undefined, formData({ date: "not-a-date", name: "Test" }));

    expect(res.error).toBe("Ungültige Eingabe.");
  });

  it("creates every day of a holiday range", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { createHolidayRangeAction } = await import("@/app/(app)/holidays/actions");
    const res = await createHolidayRangeAction(
      undefined,
      formData({ from: "2026-07-01", to: "2026-07-03", name: "Betriebsferien" })
    );

    expect(res.error).toBeUndefined();
    const created = await db.prisma.holiday.findMany({ where: { name: "Betriebsferien" } });
    expect(created).toHaveLength(3);
    const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { entityType: "Holiday" } });
    expect(JSON.parse(audit.details!)).toMatchObject({ count: 3 });
  });

  it("rejects a holiday range where 'from' is after 'to'", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { createHolidayRangeAction } = await import("@/app/(app)/holidays/actions");
    const res = await createHolidayRangeAction(
      undefined,
      formData({ from: "2026-07-10", to: "2026-07-01", name: "Betriebsferien" })
    );

    expect(res.error).toMatch(/Von-Datum/);
  });

  it("deletes a single holiday", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");
    const holiday = await db.prisma.holiday.create({ data: { date: "2026-08-01", name: "Test", year: 2026 } });

    const { deleteHolidayAction } = await import("@/app/(app)/holidays/actions");
    await deleteHolidayAction(holiday.id);

    expect(await db.prisma.holiday.findUnique({ where: { id: holiday.id } })).toBeNull();
    const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { action: "DELETE" } });
    expect(audit.entityId).toBe(holiday.id);
  });

  it("deletes multiple holidays and logs one audit entry per deletion", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");
    const h1 = await db.prisma.holiday.create({ data: { date: "2026-08-01", name: "A", year: 2026 } });
    const h2 = await db.prisma.holiday.create({ data: { date: "2026-08-02", name: "B", year: 2026 } });

    const { deleteHolidaysAction } = await import("@/app/(app)/holidays/actions");
    await deleteHolidaysAction([h1.id, h2.id]);

    expect(await db.prisma.holiday.findMany()).toHaveLength(0);
    expect(await db.prisma.auditLog.count({ where: { action: "DELETE" } })).toBe(2);
  });

  it("imports holidays for a canton/year and logs the result", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { importHolidaysAction } = await import("@/app/(app)/holidays/actions");
    const { count } = await importHolidaysAction(2026, "BE");

    expect(count).toBeGreaterThan(0);
    const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { entityType: "Holiday", action: "CREATE" } });
    expect(JSON.parse(audit.details!)).toMatchObject({ year: 2026, canton: "BE", count });
  });

  it("rejects an invalid canton code for import", async () => {
    const admin = await db.prisma.user.create({ data: createTestUser({ role: "Admin" }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { importHolidaysAction } = await import("@/app/(app)/holidays/actions");
    await expect(importHolidaysAction(2026, "invalid")).rejects.toThrow();
  });
});
