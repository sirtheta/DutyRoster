import { describe, it, expect } from "vitest";
import { weekRange, isoWeekNumber, uncoveredWeeksInRange } from "@/lib/week";

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

describe("uncoveredWeeksInRange", () => {
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
    const weekNumbers = (from: string, to: string) =>
      uncoveredWeeksInRange(from, to, duties, holidays).map((w) => w.weekNumber);
    expect(weekNumbers("2026-11-30", "2026-12-31")).toEqual([49, 51, 53]);
    // A mid-week start still evaluates the whole current week.
    expect(weekNumbers("2026-12-02", "2026-12-31")).toEqual([49, 51, 53]);
  });

  it("clips a week's dates to the given range and reports only the days inside it", () => {
    const result = uncoveredWeeksInRange("2026-11-30", "2026-12-31", new Set(), new Set());
    const week49 = result.find((w) => w.weekNumber === 49)!;
    expect(week49.start).toBe("2026-11-30");
    expect(week49.dates).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"]);
  });

  it("handles a first week that starts in the previous year", () => {
    // 2026's week 1 starts Monday 2025-12-29; only Jan 1–2 belong to 2026.
    const everyWeekCovered = new Set<string>();
    const result = uncoveredWeeksInRange("2026-01-01", "2026-12-31", everyWeekCovered, new Set());
    expect(result[0].weekNumber).toBe(1);
    expect(result[0].dates).toEqual(["2026-01-01", "2026-01-02"]);
    expect(result).toHaveLength(53);
  });

  it("clips the last week's dates to the given end of range", () => {
    // 2026-12-31 is a Thursday; the range ends there, so Friday is excluded.
    const result = uncoveredWeeksInRange("2026-12-28", "2026-12-31", new Set(), new Set());
    expect(result).toHaveLength(1);
    expect(result[0].dates).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31"]);
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
