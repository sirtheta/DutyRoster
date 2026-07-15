import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

let mockSession: Session | null = null;
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => mockSession) }));

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

function session(role: "Admin" | "Editor" | "Viewer"): Session {
  return { user: { id: "1", name: "Test", email: "t@example.com", role }, expires: "2099-01-01" } as Session;
}

describe("permissions", () => {
  beforeEach(() => {
    mockSession = null;
    mockRedirect.mockClear();
  });

  it("requireAdmin resolves for an Admin session", async () => {
    mockSession = session("Admin");
    const { requireAdmin } = await import("@/lib/permissions");
    const result = await requireAdmin();
    expect(result.user.role).toBe("Admin");
  });

  it("requireAdmin redirects a non-admin to /calendar", async () => {
    mockSession = session("Editor");
    const { requireAdmin } = await import("@/lib/permissions");
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/calendar");
  });

  it("requireEditor accepts both Admin and Editor", async () => {
    mockSession = session("Editor");
    const { requireEditor } = await import("@/lib/permissions");
    await expect(requireEditor()).resolves.toBeTruthy();
  });

  it("requireEditor redirects a Viewer", async () => {
    mockSession = session("Viewer");
    const { requireEditor } = await import("@/lib/permissions");
    await expect(requireEditor()).rejects.toThrow("REDIRECT:/calendar");
  });

  it("redirects to /login when there is no session at all", async () => {
    mockSession = null;
    const { requireSession } = await import("@/lib/permissions");
    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
  });

  it("hasRole checks the session role against an allow-list", async () => {
    const { hasRole } = await import("@/lib/permissions");
    expect(hasRole(session("Admin"), ["Admin"])).toBe(true);
    expect(hasRole(session("Viewer"), ["Admin", "Editor"])).toBe(false);
  });
});
