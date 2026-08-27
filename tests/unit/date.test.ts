import { describe, it, expect } from "vitest";
import { parseDate, toDateString, addDays, datesOfYear, weekday, isWeekend, weekdayAbbr, formatDateCH, zonedParts, isValidTimeZone, zonedTimestamp, zonedDayStart } from "@/lib/date";

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

  it("zonedParts converts an instant into the target timezone", () => {
    // 06:35 UTC on Monday 2026-03-02 is 07:35 CET in Zurich.
    const instant = new Date("2026-03-02T06:35:00Z");
    expect(zonedParts(instant, "Europe/Zurich")).toEqual({
      weekday: 1,
      hour: 7,
      minute: 35,
      date: "2026-03-02",
    });
    expect(zonedParts(instant, "UTC")).toEqual({ weekday: 1, hour: 6, minute: 35, date: "2026-03-02" });
  });

  it("zonedParts respects DST (Zurich is CEST/+02:00 in summer)", () => {
    const instant = new Date("2026-07-06T05:00:00Z");
    expect(zonedParts(instant, "Europe/Zurich")).toEqual({
      weekday: 1,
      hour: 7,
      minute: 0,
      date: "2026-07-06",
    });
  });

  it("zonedParts crosses the day boundary correctly", () => {
    // 23:30 UTC on Sunday is already 00:30 Monday in Zurich (CET).
    const instant = new Date("2026-03-01T23:30:00Z");
    expect(zonedParts(instant, "Europe/Zurich")).toEqual({
      weekday: 1,
      hour: 0,
      minute: 30,
      date: "2026-03-02",
    });
  });

  it("isValidTimeZone accepts IANA names and rejects garbage", () => {
    expect(isValidTimeZone("Europe/Zurich")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("zonedTimestamp renders ISO-8601 local time with the zone's offset", () => {
    // Winter: Zurich is CET (+01:00), summer CEST (+02:00).
    expect(zonedTimestamp(new Date("2026-01-15T22:07:03.042Z"), "Europe/Zurich")).toBe(
      "2026-01-15T23:07:03.042+01:00"
    );
    expect(zonedTimestamp(new Date("2026-07-15T22:07:03.042Z"), "Europe/Zurich")).toBe(
      "2026-07-16T00:07:03.042+02:00"
    );
  });

  it("zonedTimestamp writes UTC as +00:00 rather than a bare 'GMT'", () => {
    expect(zonedTimestamp(new Date("2026-07-15T22:07:03.042Z"), "UTC")).toBe(
      "2026-07-15T22:07:03.042+00:00"
    );
  });

  it("zonedTimestamp stays parseable back into the same instant", () => {
    const instant = new Date("2026-07-15T22:07:03.042Z");
    expect(new Date(zonedTimestamp(instant, "Europe/Zurich")).getTime()).toBe(instant.getTime());
  });

  it("zonedDayStart returns the UTC instant of local midnight", () => {
    expect(zonedDayStart("2026-01-01", "Europe/Zurich").toISOString()).toBe("2025-12-31T23:00:00.000Z");
    expect(zonedDayStart("2026-07-01", "Europe/Zurich").toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(zonedDayStart("2026-01-01", "UTC").toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("zonedDayStart handles the day the clocks change", () => {
    // DST starts 2026-03-29 in Zurich: the day still begins at 00:00 CET,
    // even though the offset changes to +02:00 a couple of hours later.
    expect(zonedDayStart("2026-03-29", "Europe/Zurich").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    // DST ends 2026-10-25: the day begins at 00:00 CEST.
    expect(zonedDayStart("2026-10-25", "Europe/Zurich").toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });

  it("zonedDayStart agrees with zonedParts on which local day it lands on", () => {
    const start = zonedDayStart("2026-08-11", "Europe/Zurich");
    expect(zonedParts(start, "Europe/Zurich")).toMatchObject({ date: "2026-08-11", hour: 0, minute: 0 });
    // One millisecond earlier is still the previous day.
    expect(zonedParts(new Date(start.getTime() - 1), "Europe/Zurich").date).toBe("2026-08-10");
  });
});
