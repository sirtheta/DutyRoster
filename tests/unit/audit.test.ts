import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

const mockCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({ default: { auditLog: { create: (...args: unknown[]) => mockCreate(...args) } } }));

function session(overrides: Partial<Session["user"]> = {}): Session {
  return { user: { id: "1", name: "Alice", email: "alice@example.com", role: "Admin", ...overrides }, expires: "2099-01-01" } as Session;
}

describe("logAudit", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("writes an audit log entry with the session's user id and name", async () => {
    mockCreate.mockResolvedValue({});
    const { logAudit } = await import("@/lib/audit");

    await logAudit(session(), "CREATE", "Entry", 5, { foo: "bar" });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: 1,
        userName: "Alice",
        action: "CREATE",
        entityType: "Entry",
        entityId: 5,
        details: JSON.stringify({ foo: "bar" }),
      },
    });
  });

  it("falls back to the session email when the user has no name", async () => {
    mockCreate.mockResolvedValue({});
    const { logAudit } = await import("@/lib/audit");

    await logAudit(session({ name: null }), "UPDATE", "Settings");

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userName: "alice@example.com", entityId: null, details: null }) })
    );
  });

  it("swallows errors from the audit write instead of throwing", async () => {
    mockCreate.mockRejectedValue(new Error("db down"));
    const { logAudit } = await import("@/lib/audit");

    await expect(logAudit(session(), "DELETE", "Holiday", 1)).resolves.toBeUndefined();
  });
});
