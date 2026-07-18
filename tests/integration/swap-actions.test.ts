import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import { createTestDatabase, createTestUser } from "../test-utils";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const db = createTestDatabase();

vi.mock("@/lib/prisma", () => ({ get default() { return db.prisma; } }));

let currentSession: Session;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => currentSession) }));

function sessionFor(userId: number, role: "Admin" | "Editor" | "Viewer", name = "Test"): Session {
  return {
    user: { id: String(userId), name, email: "test@example.com", role },
    expires: "2099-01-01",
  } as Session;
}

// A far-future Mon–Fri duty week so "no past dates" never trips.
const WEEK = ["2030-06-03", "2030-06-04", "2030-06-05", "2030-06-06", "2030-06-07"];

async function seedDutyWeek(userId: number) {
  const { prisma } = db;
  for (const date of WEEK) {
    await prisma.entry.create({ data: { userId, date, type: "S", source: "Automatic" } });
  }
}

describe("swap request actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a request for own S-duties and notifies the colleague", async () => {
    const { prisma } = db;
    const owner = await prisma.user.create({ data: createTestUser({ email: "owner@example.com", role: "Viewer" }) });
    const target = await prisma.user.create({ data: createTestUser({ email: "target@example.com", role: "Viewer" }) });
    await seedDutyWeek(owner.id);
    currentSession = sessionFor(owner.id, "Viewer", "Owner");

    const { createSwapRequestAction } = await import("@/app/(app)/swaps/actions");
    const res = await createSwapRequestAction({ toUserId: target.id, dates: WEEK, comment: "Ferien" });

    expect(res.error).toBeUndefined();
    const request = await prisma.swapRequest.findFirstOrThrow();
    expect(request.status).toBe("Pending");
    expect(JSON.parse(request.dates)).toEqual(WEEK);

    const notification = await prisma.pendingNotification.findFirstOrThrow({ where: { userId: target.id } });
    expect(notification.body).toContain("Owner");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityType: "SwapRequest" } });
    expect(audit.action).toBe("CREATE");
  });

  it("rejects requests for days that are not the requester's own S-duties", async () => {
    const { prisma } = db;
    const owner = await prisma.user.create({ data: createTestUser({ email: "owner@example.com" }) });
    const target = await prisma.user.create({ data: createTestUser({ email: "target@example.com" }) });
    currentSession = sessionFor(owner.id, "Viewer");

    const { createSwapRequestAction } = await import("@/app/(app)/swaps/actions");
    const res = await createSwapRequestAction({ toUserId: target.id, dates: [WEEK[0]] });
    expect(res.error).toMatch(/eigene S-Dienste/);
  });

  it("broadcasts to every active colleague when toUserId is null, and accepting supersedes the rest", async () => {
    const { prisma } = db;
    const owner = await prisma.user.create({ data: createTestUser({ email: "owner@example.com" }) });
    const colleagueA = await prisma.user.create({ data: createTestUser({ email: "a@example.com", role: "Viewer" }) });
    const colleagueB = await prisma.user.create({ data: createTestUser({ email: "b@example.com", role: "Viewer" }) });
    const inactive = await prisma.user.create({
      data: createTestUser({ email: "inactive@example.com", isActive: false }),
    });
    await seedDutyWeek(owner.id);
    currentSession = sessionFor(owner.id, "Viewer", "Owner");

    const { createSwapRequestAction, acceptSwapRequestAction } = await import("@/app/(app)/swaps/actions");
    const res = await createSwapRequestAction({ toUserId: null, dates: WEEK, comment: "Zeile 1\nZeile 2" });
    expect(res.error).toBeUndefined();

    const requests = await prisma.swapRequest.findMany({ orderBy: { toUserId: "asc" } });
    expect(requests).toHaveLength(2);
    expect(requests.every((r) => r.status === "Pending")).toBe(true);
    expect(requests.every((r) => r.groupId !== null)).toBe(true);
    expect(requests.map((r) => r.toUserId).sort()).toEqual([colleagueA.id, colleagueB.id].sort());
    expect(requests.every((r) => r.toUserId !== inactive.id)).toBe(true);
    expect(requests[0].comment).toBe("Zeile 1\nZeile 2");

    const requestForA = requests.find((r) => r.toUserId === colleagueA.id)!;
    const requestForB = requests.find((r) => r.toUserId === colleagueB.id)!;

    currentSession = sessionFor(colleagueA.id, "Viewer", "A");
    const acceptRes = await acceptSwapRequestAction(requestForA.id);
    expect(acceptRes.error).toBeUndefined();

    const updatedA = await prisma.swapRequest.findUniqueOrThrow({ where: { id: requestForA.id } });
    expect(updatedA.status).toBe("Accepted");
    const updatedB = await prisma.swapRequest.findUniqueOrThrow({ where: { id: requestForB.id } });
    expect(updatedB.status).toBe("Superseded");

    const moved = await prisma.entry.findMany({ where: { userId: colleagueA.id, type: "S" } });
    expect(moved).toHaveLength(WEEK.length);

    // B was notified that the request is no longer available.
    const supersededNotification = await prisma.pendingNotification.findFirstOrThrow({
      where: { userId: colleagueB.id, subject: { contains: "bereits vergeben" } },
    });
    expect(supersededNotification.body).toContain("bereits von jemand anderem angenommen");
  });

  it("cancelling one row of a broadcast request withdraws the whole group", async () => {
    const { prisma } = db;
    const owner = await prisma.user.create({ data: createTestUser({ email: "owner@example.com" }) });
    await prisma.user.create({ data: createTestUser({ email: "a@example.com" }) });
    await prisma.user.create({ data: createTestUser({ email: "b@example.com" }) });
    await seedDutyWeek(owner.id);
    currentSession = sessionFor(owner.id, "Viewer", "Owner");

    const { createSwapRequestAction, cancelSwapRequestAction } = await import("@/app/(app)/swaps/actions");
    await createSwapRequestAction({ toUserId: null, dates: WEEK });
    const requests = await prisma.swapRequest.findMany();
    expect(requests).toHaveLength(2);

    const res = await cancelSwapRequestAction(requests[0].id);
    expect(res.error).toBeUndefined();

    const updated = await prisma.swapRequest.findMany();
    expect(updated.every((r) => r.status === "Cancelled")).toBe(true);
  });

  it("rejects past dates, self-swaps, and overlapping open requests", async () => {
    const { prisma } = db;
    const owner = await prisma.user.create({ data: createTestUser({ email: "owner@example.com" }) });
    const target = await prisma.user.create({ data: createTestUser({ email: "target@example.com" }) });
    await seedDutyWeek(owner.id);
    await prisma.entry.create({ data: { userId: owner.id, date: "2020-01-06", type: "S" } });
    currentSession = sessionFor(owner.id, "Viewer");

    const { createSwapRequestAction } = await import("@/app/(app)/swaps/actions");

    expect((await createSwapRequestAction({ toUserId: target.id, dates: ["2020-01-06"] })).error).toMatch(/Vergangene/);
    expect((await createSwapRequestAction({ toUserId: owner.id, dates: WEEK })).error).toMatch(/dir selbst/);

    expect((await createSwapRequestAction({ toUserId: target.id, dates: WEEK })).error).toBeUndefined();
    expect((await createSwapRequestAction({ toUserId: target.id, dates: [WEEK[0]] })).error).toMatch(/offene Anfrage/);
  });

  it("accepting moves the entries to the acceptor and marks the request accepted", async () => {
    const { prisma } = db;
    const owner = await prisma.user.create({ data: createTestUser({ email: "owner@example.com" }) });
    const target = await prisma.user.create({ data: createTestUser({ email: "target@example.com", role: "Viewer" }) });
    await seedDutyWeek(owner.id);
    const request = await prisma.swapRequest.create({
      data: { fromUserId: owner.id, toUserId: target.id, dates: JSON.stringify(WEEK) },
    });
    currentSession = sessionFor(target.id, "Viewer", "Target");

    const { acceptSwapRequestAction } = await import("@/app/(app)/swaps/actions");
    const res = await acceptSwapRequestAction(request.id);

    expect(res.error).toBeUndefined();
    const moved = await prisma.entry.findMany({ where: { userId: target.id, type: "S" } });
    expect(moved).toHaveLength(WEEK.length);
    expect(moved.every((e) => e.source === "Swap")).toBe(true);
    expect(await prisma.entry.findMany({ where: { userId: owner.id, type: "S" } })).toHaveLength(0);

    const updated = await prisma.swapRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(updated.status).toBe("Accepted");
    expect(updated.decidedAt).not.toBeNull();

    // The requester gets notified about the decision.
    const notification = await prisma.pendingNotification.findFirstOrThrow({ where: { userId: owner.id } });
    expect(notification.subject).toContain("bestätigt");
  });

  it("accepting fails atomically when the acceptor already has an entry on one day", async () => {
    const { prisma } = db;
    const owner = await prisma.user.create({ data: createTestUser({ email: "owner@example.com" }) });
    const target = await prisma.user.create({ data: createTestUser({ email: "target@example.com" }) });
    await seedDutyWeek(owner.id);
    await prisma.entry.create({ data: { userId: target.id, date: WEEK[2], type: "F" } });
    const request = await prisma.swapRequest.create({
      data: { fromUserId: owner.id, toUserId: target.id, dates: JSON.stringify(WEEK) },
    });
    currentSession = sessionFor(target.id, "Viewer");

    const { acceptSwapRequestAction } = await import("@/app/(app)/swaps/actions");
    const res = await acceptSwapRequestAction(request.id);

    expect(res.error).toMatch(/bereits einen Eintrag/);
    // Nothing moved, request still pending.
    expect(await prisma.entry.findMany({ where: { userId: owner.id, type: "S" } })).toHaveLength(WEEK.length);
    const unchanged = await prisma.swapRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(unchanged.status).toBe("Pending");
  });

  it("only the requested colleague (or an admin) may accept; others are rejected", async () => {
    const { prisma } = db;
    const owner = await prisma.user.create({ data: createTestUser({ email: "owner@example.com" }) });
    const target = await prisma.user.create({ data: createTestUser({ email: "target@example.com" }) });
    const bystander = await prisma.user.create({ data: createTestUser({ email: "bystander@example.com" }) });
    await seedDutyWeek(owner.id);
    const request = await prisma.swapRequest.create({
      data: { fromUserId: owner.id, toUserId: target.id, dates: JSON.stringify(WEEK) },
    });

    currentSession = sessionFor(bystander.id, "Editor");
    const { acceptSwapRequestAction } = await import("@/app/(app)/swaps/actions");
    expect((await acceptSwapRequestAction(request.id)).error).toMatch(/Berechtigung/);
  });

  it("decline and cancel end a pending request without moving entries", async () => {
    const { prisma } = db;
    const owner = await prisma.user.create({ data: createTestUser({ email: "owner@example.com" }) });
    const target = await prisma.user.create({ data: createTestUser({ email: "target@example.com" }) });
    await seedDutyWeek(owner.id);
    const declineReq = await prisma.swapRequest.create({
      data: { fromUserId: owner.id, toUserId: target.id, dates: JSON.stringify([WEEK[0]]) },
    });
    const cancelReq = await prisma.swapRequest.create({
      data: { fromUserId: owner.id, toUserId: target.id, dates: JSON.stringify([WEEK[1]]) },
    });

    const { declineSwapRequestAction, cancelSwapRequestAction } = await import("@/app/(app)/swaps/actions");

    currentSession = sessionFor(target.id, "Viewer");
    expect((await declineSwapRequestAction(declineReq.id)).error).toBeUndefined();
    expect((await prisma.swapRequest.findUniqueOrThrow({ where: { id: declineReq.id } })).status).toBe("Declined");

    // Cancelling someone else's request is rejected; the owner can cancel.
    expect((await cancelSwapRequestAction(cancelReq.id)).error).toMatch(/Berechtigung/);
    currentSession = sessionFor(owner.id, "Viewer");
    expect((await cancelSwapRequestAction(cancelReq.id)).error).toBeUndefined();
    expect((await prisma.swapRequest.findUniqueOrThrow({ where: { id: cancelReq.id } })).status).toBe("Cancelled");

    expect(await prisma.entry.findMany({ where: { userId: owner.id, type: "S" } })).toHaveLength(WEEK.length);
  });
});
