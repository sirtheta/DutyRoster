import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { notifyCalendarChange } from "@/lib/calendar-events";

let currentSession: Session | null;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => currentSession) }));

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

function sessionFor(role: "Admin" | "Editor" | "Viewer"): Session {
  return { user: { id: "1", name: "Test", email: "test@example.com", role }, expires: "2099-01-01" } as Session;
}

describe("GET /api/calendar/[year]/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("redirects when there is no session", async () => {
    currentSession = null;
    const controller = new AbortController();
    const request = new NextRequest("http://localhost/api/calendar/2026/stream", { signal: controller.signal });

    const { GET } = await import("@/app/api/calendar/[year]/stream/route");
    await expect(GET(request, { params: Promise.resolve({ year: "2026" }) })).rejects.toThrow("REDIRECT:/login");
  });

  it("emits a change event only for the subscribed year", async () => {
    currentSession = sessionFor("Viewer");
    const controller = new AbortController();
    const request = new NextRequest("http://localhost/api/calendar/2026/stream", { signal: controller.signal });

    const { GET } = await import("@/app/api/calendar/[year]/stream/route");
    const res = await GET(request, { params: Promise.resolve({ year: "2026" }) });
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const reader = res.body!.getReader();
    notifyCalendarChange("2025");
    notifyCalendarChange("2026");
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value);

    expect(chunk).toBe("data: change\n\n");
    await reader.cancel();
    controller.abort();
  });
});
