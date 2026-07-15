import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import { createTestDatabase, createTestUser } from "../test-utils";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const db = createTestDatabase();

vi.mock("@/lib/prisma", () => ({ get default() { return db.prisma; } }));

let currentSession: Session;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => currentSession) }));

function sessionFor(userId: number, role: "Admin" | "Editor" | "Viewer"): Session {
  return {
    user: { id: String(userId), name: "Test", email: "test@example.com", role },
    expires: "2099-01-01",
  } as Session;
}

describe("calendar actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets an editor create their own entry and records an audit log", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    currentSession = sessionFor(user.id, "Editor");

    const { upsertEntryAction } = await import("@/app/(app)/calendar/[year]/actions");
    const res = await upsertEntryAction({ userId: user.id, date: "2026-05-04", type: "F" });

    expect(res.error).toBeUndefined();
    const entry = await prisma.entry.findUniqueOrThrow({
      where: { userId_date: { userId: user.id, date: "2026-05-04" } },
    });
    expect(entry.type).toBe("F");
    expect(entry.source).toBe("Manual");

    const audit = await prisma.auditLog.findFirst({ where: { entityType: "Entry" } });
    expect(audit?.action).toBe("CREATE");
    expect(audit?.userId).toBe(user.id);
  });

  it("rejects an editor editing another user's entry", async () => {
    const { prisma } = db;
    const editor = await prisma.user.create({ data: createTestUser({ email: "a@example.com", role: "Editor" }) });
    const other = await prisma.user.create({ data: createTestUser({ email: "b@example.com", role: "Editor" }) });
    currentSession = sessionFor(editor.id, "Editor");

    const { upsertEntryAction } = await import("@/app/(app)/calendar/[year]/actions");
    const res = await upsertEntryAction({ userId: other.id, date: "2026-05-04", type: "F" });

    expect(res.error).toMatch(/Berechtigung/);
    const entry = await prisma.entry.findUnique({
      where: { userId_date: { userId: other.id, date: "2026-05-04" } },
    });
    expect(entry).toBeNull();
  });

  it("moves an S-Dienst to a free slot and logs the move with from/to details", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    await prisma.entry.create({ data: { userId: user.id, date: "2026-06-01", type: "S" } });
    currentSession = sessionFor(user.id, "Editor");

    const { moveEntryAction } = await import("@/app/(app)/calendar/[year]/actions");
    const res = await moveEntryAction({
      fromUserId: user.id,
      fromDate: "2026-06-01",
      toUserId: user.id,
      toDate: "2026-06-05",
    });

    expect(res.error).toBeUndefined();
    expect(
      await prisma.entry.findUnique({ where: { userId_date: { userId: user.id, date: "2026-06-01" } } })
    ).toBeNull();
    const moved = await prisma.entry.findUniqueOrThrow({
      where: { userId_date: { userId: user.id, date: "2026-06-05" } },
    });
    expect(moved.type).toBe("S");
    expect(moved.source).toBe("Swap");

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "MOVE" } });
    const details = JSON.parse(audit.details!);
    expect(details.from.date).toBe("2026-06-01");
    expect(details.to.date).toBe("2026-06-05");
  });

  it("rejects moving into an already-occupied slot", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    await prisma.entry.create({ data: { userId: user.id, date: "2026-06-01", type: "S" } });
    await prisma.entry.create({ data: { userId: user.id, date: "2026-06-05", type: "F" } });
    currentSession = sessionFor(user.id, "Editor");

    const { moveEntryAction } = await import("@/app/(app)/calendar/[year]/actions");
    const res = await moveEntryAction({
      fromUserId: user.id,
      fromDate: "2026-06-01",
      toUserId: user.id,
      toDate: "2026-06-05",
    });

    expect(res.error).toMatch(/belegt/);
  });

  it("generates S-duty entries for a year and logs one AUTOMATIC entry", async () => {
    const { prisma } = db;
    const admin = await prisma.user.create({ data: createTestUser({ role: "Admin", rotationOrder: 0 }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { generateAutomationAction } = await import("@/app/(app)/calendar/[year]/actions");
    const { count } = await generateAutomationAction(2026);

    expect(count).toBeGreaterThan(0);
    const entries = await prisma.entry.findMany({ where: { source: "Automatic" } });
    expect(entries).toHaveLength(count);
    expect(entries.every((e) => e.type === "S")).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "AUTOMATIC" } });
    expect(JSON.parse(audit.details!)).toMatchObject({ year: 2026, count });
  });

  it("does not create duplicate entries when the generator runs twice", async () => {
    const { prisma } = db;
    const admin = await prisma.user.create({ data: createTestUser({ role: "Admin", rotationOrder: 0 }) });
    currentSession = sessionFor(admin.id, "Admin");

    const { generateAutomationAction } = await import("@/app/(app)/calendar/[year]/actions");
    const first = await generateAutomationAction(2026);
    const second = await generateAutomationAction(2026);

    expect(second.count).toBe(0);
    const entries = await prisma.entry.findMany({ where: { source: "Automatic" } });
    expect(entries).toHaveLength(first.count);
  });

  it("does not double-book a week where a different user already has S-duty", async () => {
    const { prisma } = db;
    const admin = await prisma.user.create({
      data: createTestUser({ email: "admin@example.com", role: "Admin", rotationOrder: 0 }),
    });
    const other = await prisma.user.create({
      data: createTestUser({ email: "other@example.com", role: "Editor", rotationOrder: 1 }),
    });
    // 2026-01-01 is a Thursday — the year's first (partial) week is 01-01/02,
    // and would normally go to `admin` (rotationOrder 0). `other` already has
    // duty there instead (e.g. a manual swap), so the week must stay as-is.
    await prisma.entry.create({ data: { userId: other.id, date: "2026-01-02", type: "S", source: "Manual" } });
    currentSession = sessionFor(admin.id, "Admin");

    const { generateAutomationAction } = await import("@/app/(app)/calendar/[year]/actions");
    await generateAutomationAction(2026);

    const adminEntries = await prisma.entry.findMany({
      where: { userId: admin.id, date: { in: ["2026-01-01", "2026-01-02"] } },
    });
    expect(adminEntries).toHaveLength(0);
  });

  it("rejects an S-duty entry on a weekend", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    currentSession = sessionFor(user.id, "Editor");

    // 2026-06-06 is a Saturday.
    const { upsertEntryAction } = await import("@/app/(app)/calendar/[year]/actions");
    const res = await upsertEntryAction({ userId: user.id, date: "2026-06-06", type: "S" });

    expect(res.error).toMatch(/Wochenende/);
    const entry = await prisma.entry.findUnique({
      where: { userId_date: { userId: user.id, date: "2026-06-06" } },
    });
    expect(entry).toBeNull();
  });
});
