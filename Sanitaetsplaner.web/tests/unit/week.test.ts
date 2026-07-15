import { describe, it, expect } from "vitest";
import { weekRange } from "@/lib/week";

describe("weekRange", () => {
  it("returns Monday..Sunday for a mid-week date", () => {
    // 2026-03-04 is a Wednesday
    const { start, end } = weekRange(new Date(2026, 2, 4));
    expect(start).toBe("2026-03-02");
    expect(end).toBe("2026-03-08");
  });

  it("treats Sunday as the last day of its own week, not the next", () => {
    // 2026-03-08 is a Sunday
    const { start, end } = weekRange(new Date(2026, 2, 8));
    expect(start).toBe("2026-03-02");
    expect(end).toBe("2026-03-08");
  });

  it("handles a Monday correctly (start === the date itself)", () => {
    const { start, end } = weekRange(new Date(2026, 2, 2));
    expect(start).toBe("2026-03-02");
    expect(end).toBe("2026-03-08");
  });
});
