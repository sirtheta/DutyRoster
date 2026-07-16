import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  it("resolves conflicting Tailwind classes to the last one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
