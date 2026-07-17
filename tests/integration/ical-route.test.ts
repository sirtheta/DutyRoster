import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createTestDatabase, createTestUser } from "../test-utils";
import { resetRateLimit } from "@/lib/rate-limit";

const db = createTestDatabase();
vi.mock("@/lib/prisma", () => ({ get default() { return db.prisma; } }));

function request(ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/ical/some-token", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("GET /api/ical/[token]", () => {
  beforeEach(() => {
    resetRateLimit("ical:203.0.113.1");
    resetRateLimit("ical:203.0.113.2");
  });

  it("returns 404 for an unknown token without leaking details", async () => {
    const { GET } = await import("@/app/api/ical/[token]/route");
    const res = await GET(request("203.0.113.2"), { params: Promise.resolve({ token: "unknown" }) });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Nicht gefunden" });
  });

  it("returns 404 for a token belonging to an inactive user", async () => {
    await db.prisma.user.create({ data: createTestUser({ icalToken: "inactive-token", isActive: false }) });

    const { GET } = await import("@/app/api/ical/[token]/route");
    const res = await GET(request("203.0.113.2"), { params: Promise.resolve({ token: "inactive-token" }) });

    expect(res.status).toBe(404);
  });

  it("returns a valid .ics feed of F and S entries for a known token", async () => {
    const user = await db.prisma.user.create({
      data: createTestUser({ icalToken: "valid-token", name: "Alice" }),
    });
    await db.prisma.entry.create({ data: { userId: user.id, date: "2026-05-04", type: "F" } });
    await db.prisma.entry.create({ data: { userId: user.id, date: "2026-05-05", type: "S" } });
    await db.prisma.entry.create({ data: { userId: user.id, date: "2026-05-06", type: "G" } });

    const { GET } = await import("@/app/api/ical/[token]/route");
    const res = await GET(request(), { params: Promise.resolve({ token: "valid-token" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("SUMMARY:F");
    expect(body).toContain("SUMMARY:S");
    expect(body).not.toContain("SUMMARY:G");
  });

  it("omits F entries when the user has disabled Ferien in the feed", async () => {
    const user = await db.prisma.user.create({
      data: createTestUser({ icalToken: "s-only-token", name: "Bob", icalIncludeVacation: false }),
    });
    await db.prisma.entry.create({ data: { userId: user.id, date: "2026-05-04", type: "F" } });
    await db.prisma.entry.create({ data: { userId: user.id, date: "2026-05-05", type: "S" } });

    const { GET } = await import("@/app/api/ical/[token]/route");
    const res = await GET(request(), { params: Promise.resolve({ token: "s-only-token" }) });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("SUMMARY:S");
    expect(body).not.toContain("SUMMARY:F");
  });

  it("rate-limits repeated failed lookups from the same IP", async () => {
    const { GET } = await import("@/app/api/ical/[token]/route");
    const ip = "203.0.113.2";
    let last;
    for (let i = 0; i < 11; i++) {
      last = await GET(request(ip), { params: Promise.resolve({ token: "unknown" }) });
    }
    expect(last!.status).toBe(429);
  });
});
