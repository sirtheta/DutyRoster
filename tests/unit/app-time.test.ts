import { describe, it, expect } from "vitest";
import { APP_TIMEZONE, appDayStart, currentYear, dayOf, formatDateTime, todayString, yearOf } from "@/lib/app-time";

// The tests below pin the app timezone to the default (Europe/Zurich), which
// is what the module resolves to when neither APP_TIMEZONE nor TZ is set — the
// case that matters, since a container without either used to fall back to UTC.
describe("app-time", () => {
  it("defaults to Europe/Zurich", () => {
    expect(APP_TIMEZONE).toBe("Europe/Zurich");
  });

  it("dayOf resolves the local calendar day, not the UTC one", () => {
    // 22:30 UTC in July is already the next day in Zurich (CEST, +02:00).
    expect(dayOf(new Date("2026-07-15T22:30:00Z"))).toBe("2026-07-16");
    // …and 23:30 UTC in January likewise (CET, +01:00).
    expect(dayOf(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
    expect(dayOf(new Date("2026-01-15T21:30:00Z"))).toBe("2026-01-15");
  });

  it("yearOf rolls over at local New Year, not UTC New Year", () => {
    // 23:30 UTC on 31 December is 00:30 on 1 January in Zurich.
    expect(yearOf(new Date("2025-12-31T23:30:00Z"))).toBe(2026);
    expect(yearOf(new Date("2025-12-31T22:30:00Z"))).toBe(2025);
  });

  it("todayString/currentYear read the current moment through the same rules", () => {
    const now = new Date();
    expect(todayString(now)).toBe(dayOf(now));
    expect(currentYear(now)).toBe(yearOf(now));
    expect(todayString(now)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("appDayStart returns the UTC instant a local day begins at", () => {
    expect(appDayStart("2026-07-16").toISOString()).toBe("2026-07-15T22:00:00.000Z");
    expect(appDayStart("2026-01-16").toISOString()).toBe("2026-01-15T23:00:00.000Z");
  });

  it("appDayStart and dayOf agree on the boundary", () => {
    const start = appDayStart("2026-07-16");
    expect(dayOf(start)).toBe("2026-07-16");
    expect(dayOf(new Date(start.getTime() - 1))).toBe("2026-07-15");
  });

  it("formatDateTime renders a stored UTC timestamp as Swiss local time", () => {
    // 22:30 UTC on 15 July is 00:30 on the 16th in Zurich.
    expect(formatDateTime(new Date("2026-07-15T22:30:45Z"))).toBe("16.07.26, 00:30:45");
  });
});
