import { describe, it, expect, vi, beforeEach } from "vitest";

class MockAuthError extends Error {}
vi.mock("next-auth", () => ({ AuthError: MockAuthError }));

const mockSignIn = vi.fn();
vi.mock("@/lib/auth", () => ({ signIn: (...args: unknown[]) => mockSignIn(...args) }));

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("loginAction", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
  });

  it("returns no error and signs in on valid credentials", async () => {
    mockSignIn.mockResolvedValue(undefined);
    const { loginAction } = await import("@/app/(auth)/login/actions");

    const res = await loginAction(undefined, formData({ email: "a@example.com", password: "hunter2" }));

    expect(res).toEqual({});
    expect(mockSignIn).toHaveBeenCalledWith("credentials", {
      email: "a@example.com",
      password: "hunter2",
      redirectTo: "/calendar",
    });
  });

  it("returns a generic error when signIn throws an AuthError", async () => {
    mockSignIn.mockRejectedValue(new MockAuthError("CredentialsSignin"));
    const { loginAction } = await import("@/app/(auth)/login/actions");

    const res = await loginAction(undefined, formData({ email: "a@example.com", password: "wrong" }));

    expect(res.error).toBe("E-Mail oder Passwort ist falsch.");
  });

  it("rethrows non-AuthError errors (e.g. NEXT_REDIRECT)", async () => {
    mockSignIn.mockRejectedValue(new Error("NEXT_REDIRECT"));
    const { loginAction } = await import("@/app/(auth)/login/actions");

    await expect(loginAction(undefined, formData({ email: "a@example.com", password: "hunter2" }))).rejects.toThrow(
      "NEXT_REDIRECT"
    );
  });
});
