import { describe, it, expect } from "vitest";
import { runRotation } from "@/lib/rotation";
import { isWeekend } from "@/lib/date";

describe("runRotation", () => {
  it("assigns whole Mon–Fri weeks per user in rotation order, skipping weekends", () => {
    const result = runRotation({
      year: 2026,
      users: [
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      holidays: new Set(),
      blockedDates: new Map(),
      occupiedDates: new Set(),
    });

    expect(result.every((a) => !isWeekend(a.date))).toBe(true);

    // 2026-01-01 is a Thursday -> first (partial) week is Thu+Fri, goes to user 1.
    expect(result.filter((a) => a.date === "2026-01-01" || a.date === "2026-01-02")).toEqual([
      { date: "2026-01-01", userId: 1 },
      { date: "2026-01-02", userId: 1 },
    ]);
    // Next full week (Mon 2026-01-05 .. Fri 2026-01-09) goes to user 2.
    const week2 = result.filter((a) => a.date >= "2026-01-05" && a.date <= "2026-01-09");
    expect(week2).toHaveLength(5);
    expect(week2.every((a) => a.userId === 2)).toBe(true);
  });

  it("respects rotationOrder regardless of input array order", () => {
    const result = runRotation({
      year: 2026,
      users: [
        { userId: 3, rotationOrder: 2 },
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      holidays: new Set(),
      blockedDates: new Map(),
      occupiedDates: new Set(),
    });
    // First week (2026-01-01/02) -> user 1, second week -> user 2, third -> user 3.
    const firstWeek = result.filter((a) => a.date <= "2026-01-02");
    expect(firstWeek.every((a) => a.userId === 1)).toBe(true);
    const secondWeek = result.filter((a) => a.date >= "2026-01-05" && a.date <= "2026-01-09");
    expect(secondWeek.every((a) => a.userId === 2)).toBe(true);
    const thirdWeek = result.filter((a) => a.date >= "2026-01-12" && a.date <= "2026-01-16");
    expect(thirdWeek.every((a) => a.userId === 3)).toBe(true);
  });

  it("skips holiday work days entirely, but a partially-holiday week still counts as the user's turn", () => {
    // 2026-01-05..09 is a full Mon-Fri week; mark Wednesday as a holiday.
    const result = runRotation({
      year: 2026,
      users: [
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      holidays: new Set(["2026-01-07"]),
      blockedDates: new Map(),
      occupiedDates: new Set(),
    });
    const week2 = result.filter((a) => a.date >= "2026-01-05" && a.date <= "2026-01-09");
    expect(week2).toHaveLength(4);
    expect(week2.find((a) => a.date === "2026-01-07")).toBeUndefined();
    expect(week2.every((a) => a.userId === 2)).toBe(true);
  });

  it("does not consume a turn for a week that is entirely holidays", () => {
    // 2026-01-01/02 (the only work days of the year's first week) are both holidays.
    const result = runRotation({
      year: 2026,
      users: [
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      holidays: new Set(["2026-01-01", "2026-01-02"]),
      blockedDates: new Map(),
      occupiedDates: new Set(),
    });
    expect(result.find((a) => a.date === "2026-01-01" || a.date === "2026-01-02")).toBeUndefined();
    // The first real week (2026-01-05..09) still goes to user 1, not user 2 —
    // the fully-holiday week didn't burn anyone's turn.
    const week2 = result.filter((a) => a.date >= "2026-01-05" && a.date <= "2026-01-09");
    expect(week2).toHaveLength(5);
    expect(week2.every((a) => a.userId === 1)).toBe(true);
  });

  it("skips the whole week for a user who is personally blocked that week, moving to the next user", () => {
    const result = runRotation({
      year: 2026,
      users: [
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      holidays: new Set(),
      // user 1 already has something planned on 2026-01-02 (part of their first-turn week).
      blockedDates: new Map([[1, new Set(["2026-01-02"])]]),
      occupiedDates: new Set(),
    });
    // First week (2026-01-01/02) would have been user 1's turn, but is skipped entirely.
    expect(result.find((a) => a.date === "2026-01-01" || a.date === "2026-01-02")).toBeUndefined();
    // Second week still goes to user 2 (rotation continues, doesn't backfill user 1).
    const week2 = result.filter((a) => a.date >= "2026-01-05" && a.date <= "2026-01-09");
    expect(week2.every((a) => a.userId === 2)).toBe(true);
  });

  it("skips the whole week when a different user already has S-duty that week", () => {
    const result = runRotation({
      year: 2026,
      users: [
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      holidays: new Set(),
      blockedDates: new Map(),
      // Someone (not user 1, who's up first) already has duty on 2026-01-02.
      occupiedDates: new Set(["2026-01-02"]),
    });
    expect(result.find((a) => a.date === "2026-01-01" || a.date === "2026-01-02")).toBeUndefined();
    const week2 = result.filter((a) => a.date >= "2026-01-05" && a.date <= "2026-01-09");
    expect(week2.every((a) => a.userId === 2)).toBe(true);
  });

  it("returns no assignments when there are no active users", () => {
    const result = runRotation({
      year: 2026,
      users: [],
      holidays: new Set(),
      blockedDates: new Map(),
      occupiedDates: new Set(),
    });
    expect(result).toEqual([]);
  });

  it("distributes roughly evenly over a full year across multiple users", () => {
    const users = [1, 2, 3, 4].map((id, i) => ({ userId: id, rotationOrder: i }));
    const result = runRotation({
      year: 2026,
      users,
      holidays: new Set(),
      blockedDates: new Map(),
      occupiedDates: new Set(),
    });
    const counts = new Map<number, number>();
    for (const a of result) counts.set(a.userId, (counts.get(a.userId) ?? 0) + 1);
    const values = [...counts.values()];
    const max = Math.max(...values);
    const min = Math.min(...values);
    expect(max - min).toBeLessThanOrEqual(10);
  });
});
