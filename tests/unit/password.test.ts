import { describe, it, expect } from "vitest";
import { dummyCompare, bcryptRounds, isCommonPassword } from "@/lib/password";

describe("password", () => {
  it("dummyCompare resolves without throwing regardless of input", async () => {
    await expect(dummyCompare("anything")).resolves.toBeUndefined();
    await expect(dummyCompare("")).resolves.toBeUndefined();
  });

  it("exposes a positive bcryptRounds count", () => {
    expect(bcryptRounds).toBeGreaterThan(0);
  });
});

describe("isCommonPassword", () => {
  it("flags well-known breached passwords regardless of case", () => {
    expect(isCommonPassword("123456")).toBe(true);
    expect(isCommonPassword("PaSsWoRd")).toBe(true);
  });

  it("does not flag an unlikely passphrase", () => {
    expect(isCommonPassword("correct-horse-battery-staple-xyzzy-42")).toBe(false);
  });
});
