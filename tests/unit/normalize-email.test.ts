import { describe, it, expect } from "vitest";
import { emailSchema } from "@/lib/normalize-email";

describe("emailSchema", () => {
  it("trims and lowercases a valid email", () => {
    const result = emailSchema.safeParse("  Test.Test@Test.DE  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("test.test@test.de");
  });

  it("normalizes different casings of the same address to the same value", () => {
    const a = emailSchema.parse("Test.Test@test.de");
    const b = emailSchema.parse("test.test@test.de");
    expect(a).toBe(b);
  });

  it("rejects an invalid email", () => {
    const result = emailSchema.safeParse("not-an-email");
    expect(result.success).toBe(false);
  });
});
