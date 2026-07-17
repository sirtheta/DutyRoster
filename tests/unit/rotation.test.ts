import { describe, it, expect } from "vitest";
import { runRotation } from "@/lib/rotation";
import { isWeekend } from "@/lib/date";

describe("runRotation", () => {
  it("assigns whole Mon–Fri weeks per user in rotation order, skipping weekends", () => {
    const { assignments, uncoveredWeeks } = runRotation({
      year: 2026,
      users: [
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      holidays: new Set(),
      blockedDates: new Map(),
      occupiedDates: new Set(),
    });

    expect(assignments.every((a) => !isWeekend(a.date))).toBe(true);
    expect(uncoveredWeeks).toEqual([]);

    // 2026-01-01 is a Thursday -> first (partial) week is Thu+Fri, goes to user 1.
    expect(assignments.filter((a) => a.date === "2026-01-01" || a.date === "2026-01-02")).toEqual([
      { date: "2026-01-01", userId: 1 },
      { date: "2026-01-02", userId: 1 },
    ]);
    // Next full week (Mon 2026-01-05 .. Fri 2026-01-09) goes to user 2.
    const week2 = assignments.filter((a) => a.date >= "2026-01-05" && a.date <= "2026-01-09");
    expect(week2).toHaveLength(5);
    expect(week2.every((a) => a.userId === 2)).toBe(true);
  });

  it("respects rotationOrder regardless of input array order", () => {
    const { assignments } = runRotation({
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
    const firstWeek = assignments.filter((a) => a.date <= "2026-01-02");
    expect(firstWeek.every((a) => a.userId === 1)).toBe(true);
    const secondWeek = assignments.filter((a) => a.date >= "2026-01-05" && a.date <= "2026-01-09");
    expect(secondWeek.every((a) => a.userId === 2)).toBe(true);
    const thirdWeek = assignments.filter((a) => a.date >= "2026-01-12" && a.date <= "2026-01-16");
    expect(thirdWeek.every((a) => a.userId === 3)).toBe(true);
  });

  it("skips holiday work days entirely, but a partially-holiday week still counts as the user's turn", () => {
    // 2026-01-05..09 is a full Mon-Fri week; mark Wednesday as a holiday.
    const { assignments } = runRotation({
      year: 2026,
      users: [
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      holidays: new Set(["2026-01-07"]),
      blockedDates: new Map(),
      occupiedDates: new Set(),
    });
    const week2 = assignments.filter((a) => a.date >= "2026-01-05" && a.date <= "2026-01-09");
    expect(week2).toHaveLength(4);
    expect(week2.find((a) => a.date === "2026-01-07")).toBeUndefined();
    expect(week2.every((a) => a.userId === 2)).toBe(true);
  });

  it("does not consume a turn for a week that is entirely holidays", () => {
    // 2026-01-01/02 (the only work days of the year's first week) are both holidays.
    const { assignments } = runRotation({
      year: 2026,
      users: [
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      holidays: new Set(["2026-01-01", "2026-01-02"]),
      blockedDates: new Map(),
      occupiedDates: new Set(),
    });
    expect(assignments.find((a) => a.date === "2026-01-01" || a.date === "2026-01-02")).toBeUndefined();
    // The first real week (2026-01-05..09) still goes to user 1, not user 2 —
    // the fully-holiday week didn't burn anyone's turn.
    const week2 = assignments.filter((a) => a.date >= "2026-01-05" && a.date <= "2026-01-09");
    expect(week2).toHaveLength(5);
    expect(week2.every((a) => a.userId === 1)).toBe(true);
  });

  it("hands a blocked user's week to the next available user; the blocked user keeps their turn", () => {
    const { assignments, uncoveredWeeks } = runRotation({
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
    // User 2 covers the first week instead of it staying empty.
    const week1 = assignments.filter((a) => a.date <= "2026-01-02");
    expect(week1).toHaveLength(2);
    expect(week1.every((a) => a.userId === 2)).toBe(true);
    // User 1 kept their place at the front and gets the next week.
    const week2 = assignments.filter((a) => a.date >= "2026-01-05" && a.date <= "2026-01-09");
    expect(week2.every((a) => a.userId === 1)).toBe(true);
    expect(uncoveredWeeks).toEqual([]);
  });

  it("reports a week as uncovered when every user is blocked", () => {
    const { assignments, uncoveredWeeks } = runRotation({
      year: 2026,
      users: [
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      holidays: new Set(),
      blockedDates: new Map([
        [1, new Set(["2026-01-01"])],
        [2, new Set(["2026-01-02"])],
      ]),
      occupiedDates: new Set(),
    });
    expect(assignments.find((a) => a.date <= "2026-01-02")).toBeUndefined();
    expect(uncoveredWeeks).toEqual(["2026-01-01"]);
    // The following week continues with user 1 (nobody's turn was consumed).
    const week2 = assignments.filter((a) => a.date >= "2026-01-05" && a.date <= "2026-01-09");
    expect(week2.every((a) => a.userId === 1)).toBe(true);
  });

  it("skips an already-covered week without consuming anyone's turn", () => {
    const { assignments, uncoveredWeeks } = runRotation({
      year: 2026,
      users: [
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      holidays: new Set(),
      blockedDates: new Map(),
      // Someone already has duty on 2026-01-02 — that week is covered.
      occupiedDates: new Set(["2026-01-02"]),
    });
    expect(assignments.find((a) => a.date === "2026-01-01" || a.date === "2026-01-02")).toBeUndefined();
    expect(uncoveredWeeks).toEqual([]);
    // User 1 didn't lose their turn to the manually-covered week.
    const week2 = assignments.filter((a) => a.date >= "2026-01-05" && a.date <= "2026-01-09");
    expect(week2.every((a) => a.userId === 1)).toBe(true);
  });

  it("returns no assignments when there are no active users", () => {
    const result = runRotation({
      year: 2026,
      users: [],
      holidays: new Set(),
      blockedDates: new Map(),
      occupiedDates: new Set(),
    });
    expect(result).toEqual({ assignments: [], uncoveredWeeks: [] });
  });

  it("distributes roughly evenly over a full year across multiple users", () => {
    const users = [1, 2, 3, 4].map((id, i) => ({ userId: id, rotationOrder: i }));
    const { assignments } = runRotation({
      year: 2026,
      users,
      holidays: new Set(),
      blockedDates: new Map(),
      occupiedDates: new Set(),
    });
    const counts = new Map<number, number>();
    for (const a of assignments) counts.set(a.userId, (counts.get(a.userId) ?? 0) + 1);
    const values = [...counts.values()];
    const max = Math.max(...values);
    const min = Math.min(...values);
    expect(max - min).toBeLessThanOrEqual(10);
  });

  it("stays roughly even even when users are blocked for some weeks", () => {
    // User 1 is away the whole of February — others cover, and user 1's
    // turns resume afterwards without permanently skewing the distribution.
    const februaryDays = new Set<string>();
    for (let day = 1; day <= 28; day++) {
      februaryDays.add(`2026-02-${String(day).padStart(2, "0")}`);
    }
    const { assignments, uncoveredWeeks } = runRotation({
      year: 2026,
      users: [1, 2, 3].map((id, i) => ({ userId: id, rotationOrder: i })),
      holidays: new Set(),
      blockedDates: new Map([[1, februaryDays]]),
      occupiedDates: new Set(),
    });
    expect(uncoveredWeeks).toEqual([]);
    expect(assignments.filter((a) => a.userId === 1 && a.date.startsWith("2026-02"))).toEqual([]);
    const counts = new Map<number, number>();
    for (const a of assignments) counts.set(a.userId, (counts.get(a.userId) ?? 0) + 1);
    const values = [...counts.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(15);
  });
});
