import { describe, it, expect } from "vitest";
import { createTestDatabase } from "../test-utils";
import { importHolidaysForYear, holidaySetForYear } from "@/lib/holidays";

describe("holidays", () => {
  const db = createTestDatabase();

  it("imports public holidays for a canton/year and is idempotent", async () => {
    const firstCount = await importHolidaysForYear(2026, "BE", db.prisma);
    expect(firstCount).toBeGreaterThan(0);

    const set = await holidaySetForYear(2026, db.prisma);
    expect(set.has("2026-01-01")).toBe(true);
    expect(set.size).toBe(firstCount);

    // Re-importing the same year/canton skips already-present rows.
    const secondCount = await importHolidaysForYear(2026, "BE", db.prisma);
    expect(secondCount).toBe(0);
  });
});
