import { describe, it, expect } from "vitest";
import { weekRange, isoWeekNumber, uncoveredWeekNumbers } from "@/lib/week";

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

describe("uncoveredWeekNumbers", () => {
  it("lists weeks without duty, skipping covered and fully-holiday weeks", () => {
    // From Monday 2026-11-30 (KW 49) to year end: KW 50 has duty on
    // Tuesday, KW 52 is entirely holidays — 49, 51, 53 stay uncovered.
    const duties = new Set(["2026-12-08"]);
    const holidays = new Set([
      "2026-12-21",
      "2026-12-22",
      "2026-12-23",
      "2026-12-24",
      "2026-12-25",
    ]);
    expect(uncoveredWeekNumbers("2026-11-30", duties, holidays)).toEqual([49, 51, 53]);
    // A mid-week start still evaluates the whole current week.
    expect(uncoveredWeekNumbers("2026-12-02", duties, holidays)).toEqual([49, 51, 53]);
  });

  it("handles a first week that starts in the previous year", () => {
    // 2026's week 1 starts Monday 2025-12-29; only Jan 1–2 belong to 2026.
    const everyWeekCovered = new Set<string>();
    const result = uncoveredWeekNumbers("2026-01-01", everyWeekCovered, new Set());
    expect(result[0]).toBe(1);
    expect(result).toHaveLength(53);
  });
});

describe("isoWeekNumber", () => {
  it("computes ISO week numbers including year-boundary weeks", () => {
    expect(isoWeekNumber("2026-01-01")).toBe(1); // Thursday, ISO week 1
    expect(isoWeekNumber("2026-03-02")).toBe(10);
    expect(isoWeekNumber("2026-12-31")).toBe(53);
    // 2027-01-01 is a Friday and still belongs to ISO week 53 of 2026.
    expect(isoWeekNumber("2027-01-01")).toBe(53);
    expect(isoWeekNumber("2025-12-29")).toBe(1); // Monday of 2026's week 1
  });
});
