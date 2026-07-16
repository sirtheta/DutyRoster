import { describe, it, expect } from "vitest";
import { dummyCompare, bcryptRounds } from "@/lib/password";

describe("password", () => {
  it("dummyCompare resolves without throwing regardless of input", async () => {
    await expect(dummyCompare("anything")).resolves.toBeUndefined();
    await expect(dummyCompare("")).resolves.toBeUndefined();
  });

  it("exposes a positive bcryptRounds count", () => {
    expect(bcryptRounds).toBeGreaterThan(0);
  });
});
