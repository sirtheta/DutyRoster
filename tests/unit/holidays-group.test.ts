import { describe, it, expect } from "vitest";
import type { Holiday } from "@prisma/client";
import { groupConsecutiveHolidays } from "@/lib/holidays";

function holiday(overrides: Partial<Holiday>): Holiday {
  return {
    id: 1,
    date: "2026-01-01",
    name: "Neujahr",
    canton: null,
    year: 2026,
    ...overrides,
  } as Holiday;
}

describe("groupConsecutiveHolidays", () => {
  it("merges consecutive same-name/canton holidays into one group", () => {
    const groups = groupConsecutiveHolidays([
      holiday({ id: 1, date: "2026-07-01", name: "Betriebsferien", canton: "BE" }),
      holiday({ id: 2, date: "2026-07-02", name: "Betriebsferien", canton: "BE" }),
      holiday({ id: 3, date: "2026-07-03", name: "Betriebsferien", canton: "BE" }),
    ]);
    expect(groups).toEqual([
      { ids: [1, 2, 3], from: "2026-07-01", to: "2026-07-03", name: "Betriebsferien", canton: "BE" },
    ]);
  });

  it("does not merge holidays with a gap in dates", () => {
    const groups = groupConsecutiveHolidays([
      holiday({ id: 1, date: "2026-07-01", name: "Betriebsferien" }),
      holiday({ id: 2, date: "2026-07-03", name: "Betriebsferien" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("does not merge holidays with different names or cantons", () => {
    const groups = groupConsecutiveHolidays([
      holiday({ id: 1, date: "2026-01-01", name: "Neujahr", canton: "BE" }),
      holiday({ id: 2, date: "2026-01-02", name: "Berchtoldstag", canton: "BE" }),
      holiday({ id: 3, date: "2026-01-03", name: "Berchtoldstag", canton: "ZH" }),
    ]);
    expect(groups).toHaveLength(3);
  });

  it("returns an empty array for no holidays", () => {
    expect(groupConsecutiveHolidays([])).toEqual([]);
  });
});
