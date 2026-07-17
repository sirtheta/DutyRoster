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

  it("lets an editor create an S-Dienst entry for another user", async () => {
    const { prisma } = db;
    const editor = await prisma.user.create({ data: createTestUser({ email: "a@example.com", role: "Editor" }) });
    const other = await prisma.user.create({ data: createTestUser({ email: "b@example.com", role: "Editor" }) });
    currentSession = sessionFor(editor.id, "Editor");

    const { upsertEntryAction } = await import("@/app/(app)/calendar/[year]/actions");
    const res = await upsertEntryAction({ userId: other.id, date: "2026-05-04", type: "S" });

    expect(res.error).toBeUndefined();
    const entry = await prisma.entry.findUniqueOrThrow({
      where: { userId_date: { userId: other.id, date: "2026-05-04" } },
    });
    expect(entry.type).toBe("S");
  });

  it("lets an editor clear another user's S-Dienst entry but not their non-Dienst entry", async () => {
    const { prisma } = db;
    const editor = await prisma.user.create({ data: createTestUser({ email: "a@example.com", role: "Editor" }) });
    const other = await prisma.user.create({ data: createTestUser({ email: "b@example.com", role: "Editor" }) });
    await prisma.entry.create({ data: { userId: other.id, date: "2026-05-04", type: "S" } });
    await prisma.entry.create({ data: { userId: other.id, date: "2026-05-05", type: "F" } });
    currentSession = sessionFor(editor.id, "Editor");

    const { upsertEntryAction } = await import("@/app/(app)/calendar/[year]/actions");
    const clearS = await upsertEntryAction({ userId: other.id, date: "2026-05-04", type: null });
    expect(clearS.error).toBeUndefined();
    expect(
      await prisma.entry.findUnique({ where: { userId_date: { userId: other.id, date: "2026-05-04" } } })
    ).toBeNull();

    const clearF = await upsertEntryAction({ userId: other.id, date: "2026-05-05", type: null });
    expect(clearF.error).toMatch(/Berechtigung/);
    expect(
      await prisma.entry.findUnique({ where: { userId_date: { userId: other.id, date: "2026-05-05" } } })
    ).not.toBeNull();
  });

  it("lets an editor bulk-set S-Dienst for another user but not other entry types", async () => {
    const { prisma } = db;
    const editor = await prisma.user.create({ data: createTestUser({ email: "a@example.com", role: "Editor" }) });
    const other = await prisma.user.create({ data: createTestUser({ email: "b@example.com", role: "Editor" }) });
    currentSession = sessionFor(editor.id, "Editor");

    const { bulkSetEntriesAction } = await import("@/app/(app)/calendar/[year]/actions");
    const sRes = await bulkSetEntriesAction([{ userId: other.id, date: "2026-05-04" }], "S");
    expect(sRes.count).toBe(1);
    expect(
      (await prisma.entry.findUniqueOrThrow({ where: { userId_date: { userId: other.id, date: "2026-05-04" } } }))
        .type
    ).toBe("S");

    const fRes = await bulkSetEntriesAction([{ userId: other.id, date: "2026-05-11" }], "F");
    expect(fRes.count).toBe(0);
    expect(
      await prisma.entry.findUnique({ where: { userId_date: { userId: other.id, date: "2026-05-11" } } })
    ).toBeNull();
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

  it("moves multiple S-Dienste together, preserving their relative offsets", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    await prisma.entry.create({ data: { userId: user.id, date: "2026-06-01", type: "S" } });
    await prisma.entry.create({ data: { userId: user.id, date: "2026-06-02", type: "S" } });
    currentSession = sessionFor(user.id, "Editor");

    const { moveEntriesAction } = await import("@/app/(app)/calendar/[year]/actions");
    const res = await moveEntriesAction([
      { fromUserId: user.id, fromDate: "2026-06-01", toUserId: user.id, toDate: "2026-06-08" },
      { fromUserId: user.id, fromDate: "2026-06-02", toUserId: user.id, toDate: "2026-06-09" },
    ]);

    expect(res.error).toBeUndefined();
    expect(res.count).toBe(2);
    expect(
      await prisma.entry.findUnique({ where: { userId_date: { userId: user.id, date: "2026-06-01" } } })
    ).toBeNull();
    expect(
      await prisma.entry.findUnique({ where: { userId_date: { userId: user.id, date: "2026-06-02" } } })
    ).toBeNull();
    expect(
      (await prisma.entry.findUniqueOrThrow({ where: { userId_date: { userId: user.id, date: "2026-06-08" } } }))
        .type
    ).toBe("S");
    expect(
      (await prisma.entry.findUniqueOrThrow({ where: { userId_date: { userId: user.id, date: "2026-06-09" } } }))
        .type
    ).toBe("S");

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "MOVE" } });
    expect(JSON.parse(audit.details!)).toMatchObject({ bulk: true, count: 2 });
  });

  it("allows a multi-move that shifts into a slot vacated by the same batch", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    await prisma.entry.create({ data: { userId: user.id, date: "2026-06-01", type: "S" } });
    await prisma.entry.create({ data: { userId: user.id, date: "2026-06-02", type: "S" } });
    currentSession = sessionFor(user.id, "Editor");

    const { moveEntriesAction } = await import("@/app/(app)/calendar/[year]/actions");
    // Shift the block one day later: 06-02 moves into the slot 06-01 is
    // about to vacate, which must not be treated as "already occupied".
    const res = await moveEntriesAction([
      { fromUserId: user.id, fromDate: "2026-06-01", toUserId: user.id, toDate: "2026-06-02" },
      { fromUserId: user.id, fromDate: "2026-06-02", toUserId: user.id, toDate: "2026-06-03" },
    ]);

    expect(res.error).toBeUndefined();
    expect(res.count).toBe(2);
    expect(
      (await prisma.entry.findUniqueOrThrow({ where: { userId_date: { userId: user.id, date: "2026-06-02" } } }))
        .type
    ).toBe("S");
    expect(
      (await prisma.entry.findUniqueOrThrow({ where: { userId_date: { userId: user.id, date: "2026-06-03" } } }))
        .type
    ).toBe("S");
  });

  it("rejects a multi-move if any target is occupied by an entry outside the batch", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    await prisma.entry.create({ data: { userId: user.id, date: "2026-06-01", type: "S" } });
    await prisma.entry.create({ data: { userId: user.id, date: "2026-06-02", type: "S" } });
    await prisma.entry.create({ data: { userId: user.id, date: "2026-06-09", type: "F" } });
    currentSession = sessionFor(user.id, "Editor");

    const { moveEntriesAction } = await import("@/app/(app)/calendar/[year]/actions");
    const res = await moveEntriesAction([
      { fromUserId: user.id, fromDate: "2026-06-01", toUserId: user.id, toDate: "2026-06-08" },
      { fromUserId: user.id, fromDate: "2026-06-02", toUserId: user.id, toDate: "2026-06-09" },
    ]);

    expect(res.error).toMatch(/belegt/);
    // Nothing should have moved.
    expect(
      (await prisma.entry.findUniqueOrThrow({ where: { userId_date: { userId: user.id, date: "2026-06-01" } } }))
        .type
    ).toBe("S");
  });

  it("rejects a multi-move that includes a weekend target", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    await prisma.entry.create({ data: { userId: user.id, date: "2026-06-01", type: "S" } });
    currentSession = sessionFor(user.id, "Editor");

    const { moveEntriesAction } = await import("@/app/(app)/calendar/[year]/actions");
    // 2026-06-06 is a Saturday.
    const res = await moveEntriesAction([
      { fromUserId: user.id, fromDate: "2026-06-01", toUserId: user.id, toDate: "2026-06-06" },
    ]);

    expect(res.error).toMatch(/Wochenende/);
  });

  it("lets an editor multi-move another user's S-Dienst entry", async () => {
    const { prisma } = db;
    const editor = await prisma.user.create({ data: createTestUser({ email: "a@example.com", role: "Editor" }) });
    const other = await prisma.user.create({ data: createTestUser({ email: "b@example.com", role: "Editor" }) });
    await prisma.entry.create({ data: { userId: other.id, date: "2026-06-01", type: "S" } });
    currentSession = sessionFor(editor.id, "Editor");

    const { moveEntriesAction } = await import("@/app/(app)/calendar/[year]/actions");
    const res = await moveEntriesAction([
      { fromUserId: other.id, fromDate: "2026-06-01", toUserId: other.id, toDate: "2026-06-08" },
    ]);

    expect(res.error).toBeUndefined();
    expect(res.count).toBe(1);
    const entry = await prisma.entry.findUnique({
      where: { userId_date: { userId: other.id, date: "2026-06-08" } },
    });
    expect(entry?.type).toBe("S");
  });

  it("rejects an editor multi-moving another user's non-Dienst entry", async () => {
    const { prisma } = db;
    const editor = await prisma.user.create({ data: createTestUser({ email: "a@example.com", role: "Editor" }) });
    const other = await prisma.user.create({ data: createTestUser({ email: "b@example.com", role: "Editor" }) });
    await prisma.entry.create({ data: { userId: other.id, date: "2026-06-01", type: "F" } });
    currentSession = sessionFor(editor.id, "Editor");

    const { moveEntriesAction } = await import("@/app/(app)/calendar/[year]/actions");
    const res = await moveEntriesAction([
      { fromUserId: other.id, fromDate: "2026-06-01", toUserId: other.id, toDate: "2026-06-08" },
    ]);

    expect(res.error).toMatch(/Nur S-Dienste/);
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

  it("continues the rotation after the previous year's last automated duty", async () => {
    const { prisma } = db;
    const admin = await prisma.user.create({
      data: createTestUser({ email: "admin@example.com", role: "Admin", rotationOrder: 0 }),
    });
    const second = await prisma.user.create({
      data: createTestUser({ email: "second@example.com", role: "Editor", rotationOrder: 1 }),
    });
    // `admin` had the last automated week of 2025, so 2026 must start with `second`.
    await prisma.entry.create({
      data: { userId: admin.id, date: "2025-12-29", type: "S", source: "Automatic" },
    });
    currentSession = sessionFor(admin.id, "Admin");

    const { generateAutomationAction } = await import("@/app/(app)/calendar/[year]/actions");
    await generateAutomationAction(2026);

    const firstWeek = await prisma.entry.findMany({
      where: { date: { in: ["2026-01-01", "2026-01-02"] }, type: "S" },
    });
    expect(firstWeek).toHaveLength(2);
    expect(firstWeek.every((e) => e.userId === second.id)).toBe(true);
  });

  it("rejects malformed and impossible dates", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    currentSession = sessionFor(user.id, "Editor");

    const { upsertEntryAction } = await import("@/app/(app)/calendar/[year]/actions");
    for (const date of ["not-a-date", "2026-02-31", "2026-13-01", "2026-05-04'; --"]) {
      const res = await upsertEntryAction({ userId: user.id, date, type: "F" });
      expect(res.error).toMatch(/Datum/);
    }
    expect(await prisma.entry.count({ where: { userId: user.id } })).toBe(0);
  });

  it("rejects an over-long comment", async () => {
    const { prisma } = db;
    const user = await prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    currentSession = sessionFor(user.id, "Editor");

    const { upsertEntryAction } = await import("@/app/(app)/calendar/[year]/actions");
    const res = await upsertEntryAction({
      userId: user.id,
      date: "2026-05-04",
      type: "F",
      comment: "x".repeat(501),
    });
    expect(res.error).toMatch(/Kommentar/);
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
