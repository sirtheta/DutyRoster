import { describe, it, expect } from "vitest";
import { runRotation } from "@/lib/rotation";
import { datesOfYear } from "@/lib/date";

describe("runRotation", () => {
  it("assigns consecutive blocks of blockSize days per user in order", () => {
    const result = runRotation({
      year: 2026,
      users: [
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
        { userId: 3, rotationOrder: 2 },
      ],
      blockSize: 5,
      holidays: new Set(),
      blockedDates: new Map(),
    });

    const dates = datesOfYear(2026);
    expect(result).toHaveLength(dates.length);
    // First 5 days go to user 1, next 5 to user 2, next 5 to user 3, then back to user 1
    for (let i = 0; i < 20; i++) {
      const expectedUser = [1, 2, 3][Math.floor(i / 5) % 3];
      expect(result[i].userId).toBe(expectedUser);
      expect(result[i].date).toBe(dates[i]);
    }
  });

  it("respects rotationOrder regardless of input array order", () => {
    const result = runRotation({
      year: 2026,
      users: [
        { userId: 3, rotationOrder: 2 },
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      blockSize: 2,
      holidays: new Set(),
      blockedDates: new Map(),
    });
    expect(result[0].userId).toBe(1);
    expect(result[1].userId).toBe(1);
    expect(result[2].userId).toBe(2);
    expect(result[3].userId).toBe(2);
    expect(result[4].userId).toBe(3);
  });

  it("skips holidays entirely — no assignment for anyone, block count unaffected", () => {
    const dates = datesOfYear(2026);
    const holiday = dates[2];
    const result = runRotation({
      year: 2026,
      users: [
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      blockSize: 3,
      holidays: new Set([holiday]),
      blockedDates: new Map(),
    });

    expect(result.find((a) => a.date === holiday)).toBeUndefined();
    // Day 1, 2 -> user 1; holiday skipped; day 4 (index 3) still counts as the
    // 3rd day of user 1's block since the holiday didn't consume a slot.
    expect(result[0]).toMatchObject({ date: dates[0], userId: 1 });
    expect(result[1]).toMatchObject({ date: dates[1], userId: 1 });
    expect(result[2]).toMatchObject({ date: dates[3], userId: 1 });
    expect(result[3]).toMatchObject({ date: dates[4], userId: 2 });
  });

  it("advances rotation to the next user when the current user is individually blocked", () => {
    const dates = datesOfYear(2026);
    const blockedDay = dates[1];
    const result = runRotation({
      year: 2026,
      users: [
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      blockSize: 5,
      holidays: new Set(),
      blockedDates: new Map([[1, new Set([blockedDay])]]),
    });

    // User 1 gets day 0, is blocked on day 1 so it goes to user 2, who then
    // starts a fresh block of `blockSize` days from day 1 (not just one day).
    expect(result[0]).toMatchObject({ date: dates[0], userId: 1 });
    expect(result[1]).toMatchObject({ date: dates[1], userId: 2 });
    expect(result[2]).toMatchObject({ date: dates[2], userId: 2 });
  });

  it("leaves a day unassigned when every user is blocked", () => {
    const dates = datesOfYear(2026);
    const day = dates[0];
    const result = runRotation({
      year: 2026,
      users: [
        { userId: 1, rotationOrder: 0 },
        { userId: 2, rotationOrder: 1 },
      ],
      blockSize: 5,
      holidays: new Set(),
      blockedDates: new Map([
        [1, new Set([day])],
        [2, new Set([day])],
      ]),
    });
    expect(result.find((a) => a.date === day)).toBeUndefined();
  });

  it("returns no assignments when there are no active users", () => {
    const result = runRotation({
      year: 2026,
      users: [],
      blockSize: 5,
      holidays: new Set(),
      blockedDates: new Map(),
    });
    expect(result).toEqual([]);
  });

  it("distributes roughly evenly over a full year across multiple users", () => {
    const users = [1, 2, 3, 4].map((id, i) => ({ userId: id, rotationOrder: i }));
    const result = runRotation({
      year: 2026,
      users,
      blockSize: 5,
      holidays: new Set(),
      blockedDates: new Map(),
    });
    const counts = new Map<number, number>();
    for (const a of result) counts.set(a.userId, (counts.get(a.userId) ?? 0) + 1);
    const values = [...counts.values()];
    const max = Math.max(...values);
    const min = Math.min(...values);
    // 365/4 ≈ 91 days per user; blocks of 5 keep the spread tight.
    expect(max - min).toBeLessThanOrEqual(10);
  });
});
