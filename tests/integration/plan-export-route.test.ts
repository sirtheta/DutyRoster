import { describe, it, expect, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { createTestDatabase, createTestUser } from "../test-utils";

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

function request(): NextRequest {
  return new NextRequest("http://localhost/api/plan/2026/export");
}

describe("GET /api/plan/[year]/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a Viewer to export (read-only, any active role)", async () => {
    const user = await db.prisma.user.create({ data: createTestUser({ role: "Viewer" }) });
    currentSession = sessionFor(user.id, "Viewer");

    const { GET } = await import("@/app/api/plan/[year]/export/route");
    const res = await GET(request(), { params: Promise.resolve({ year: "2026" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
  });

  it("returns 400 for a non-numeric year", async () => {
    const user = await db.prisma.user.create({ data: createTestUser({ role: "Editor" }) });
    currentSession = sessionFor(user.id, "Editor");

    const { GET } = await import("@/app/api/plan/[year]/export/route");
    const res = await GET(request(), { params: Promise.resolve({ year: "not-a-year" }) });

    expect(res.status).toBe(400);
  });

  it("builds an .xlsx workbook with a sheet named after the year and one row per active user", async () => {
    const admin = await db.prisma.user.create({
      data: createTestUser({ email: "admin@example.com", role: "Editor", name: "Alice", rotationOrder: 0 }),
    });
    await db.prisma.user.create({
      data: createTestUser({ email: "inactive@example.com", role: "Editor", name: "Inactive", isActive: false }),
    });
    await db.prisma.entry.create({ data: { userId: admin.id, date: "2026-05-04", type: "S" } });
    currentSession = sessionFor(admin.id, "Editor");

    const { GET } = await import("@/app/api/plan/[year]/export/route");
    const res = await GET(request(), { params: Promise.resolve({ year: "2026" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
    const buffer = Buffer.from(await res.arrayBuffer());

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("2026");
    expect(sheet).toBeDefined();

    const names = new Set<string>();
    sheet!.eachRow((row) => {
      const value = row.getCell(1).value;
      if (typeof value === "string") names.add(value);
    });
    expect(names.has("Alice")).toBe(true);
    expect(names.has("Inactive")).toBe(false);
  });

  it("keeps a user terminated mid-year on that year's export, but not the next year's", async () => {
    const admin = await db.prisma.user.create({
      data: createTestUser({ email: "admin@example.com", role: "Editor", name: "Alice", rotationOrder: 0 }),
    });
    await db.prisma.user.create({
      data: createTestUser({
        email: "left@example.com",
        role: "Editor",
        name: "Left",
        isActive: false,
        exitDate: "2026-06-15",
      }),
    });
    currentSession = sessionFor(admin.id, "Editor");

    const { GET } = await import("@/app/api/plan/[year]/export/route");

    const namesForYear = async (year: string) => {
      const res = await GET(new NextRequest(`http://localhost/api/plan/${year}/export`), {
        params: Promise.resolve({ year }),
      });
      const buffer = Buffer.from(await res.arrayBuffer());
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.getWorksheet(year)!;
      const names = new Set<string>();
      sheet.eachRow((row) => {
        const value = row.getCell(1).value;
        if (typeof value === "string") names.add(value);
      });
      return names;
    };

    expect((await namesForYear("2026")).has("Left")).toBe(true);
    expect((await namesForYear("2027")).has("Left")).toBe(false);
  });
});
