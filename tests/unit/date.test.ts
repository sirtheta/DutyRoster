import { describe, it, expect } from "vitest";
import { parseDate, toDateString, addDays, datesOfYear, weekday, isWeekend, weekdayAbbr, formatDateCH } from "@/lib/date";

describe("date helpers", () => {
  it("parses YYYY-MM-DD as local midnight", () => {
    const d = parseDate("2026-03-05");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(5);
  });

  it("round-trips toDateString(parseDate(x)) === x", () => {
    expect(toDateString(parseDate("2026-01-01")!)).toBe("2026-01-01");
    expect(toDateString(parseDate("2026-12-31")!)).toBe("2026-12-31");
  });

  it("adds days across month/year boundaries", () => {
    expect(addDays("2026-01-30", 5)).toBe("2026-02-04");
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
  });

  it("datesOfYear returns 365 days for a non-leap year and starts/ends correctly", () => {
    const dates = datesOfYear(2026);
    expect(dates).toHaveLength(365);
    expect(dates[0]).toBe("2026-01-01");
    expect(dates[dates.length - 1]).toBe("2026-12-31");
  });

  it("datesOfYear returns 366 days for a leap year", () => {
    expect(datesOfYear(2028)).toHaveLength(366);
  });

  it("weekday/isWeekend identify Saturdays and Sundays", () => {
    // 2026-01-03 is a Saturday, 2026-01-04 a Sunday, 2026-01-05 a Monday
    expect(weekday("2026-01-03")).toBe(6);
    expect(isWeekend("2026-01-03")).toBe(true);
    expect(weekday("2026-01-04")).toBe(0);
    expect(isWeekend("2026-01-04")).toBe(true);
    expect(isWeekend("2026-01-05")).toBe(false);
  });

  it("parseDate returns undefined for empty/malformed input", () => {
    expect(parseDate(undefined)).toBeUndefined();
    expect(parseDate("")).toBeUndefined();
    expect(parseDate("not-a-date")).toBeUndefined();
  });

  it("addDays returns the input unchanged when it can't be parsed", () => {
    expect(addDays("not-a-date", 5)).toBe("not-a-date");
  });

  it("formatDateCH formats YYYY-MM-DD as DD.MM.YYYY", () => {
    expect(formatDateCH("2026-03-05")).toBe("05.03.2026");
  });

  it("weekdayAbbr returns the German two-letter abbreviation", () => {
    expect(weekdayAbbr("2026-01-03")).toBe("Sa");
    expect(weekdayAbbr("2026-01-04")).toBe("So");
    expect(weekdayAbbr("2026-01-05")).toBe("Mo");
  });
});
