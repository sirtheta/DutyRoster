import { describe, it, expect } from "vitest";
import { checkRateLimit, isRateLimited, recordFailedAttempt, resetRateLimit } from "@/lib/rate-limit";

describe("rate-limit", () => {
  it("blocks after maxAttempts within the window", () => {
    const key = "test:block";
    expect(checkRateLimit(key, { maxAttempts: 3 })).toBe(true);
    expect(checkRateLimit(key, { maxAttempts: 3 })).toBe(true);
    expect(checkRateLimit(key, { maxAttempts: 3 })).toBe(true);
    expect(checkRateLimit(key, { maxAttempts: 3 })).toBe(false);
    resetRateLimit(key);
    expect(checkRateLimit(key, { maxAttempts: 3 })).toBe(true);
  });

  it("opens a new window after the previous one expires", () => {
    const key = "test:window";
    expect(checkRateLimit(key, { maxAttempts: 1, windowMs: -1 })).toBe(true);
    // windowMs -1 → resetAt is already in the past, so the next call starts fresh
    expect(checkRateLimit(key, { maxAttempts: 1, windowMs: -1 })).toBe(true);
  });

  it("isRateLimited peeks without consuming and recordFailedAttempt consumes", () => {
    const key = "test:peek";
    expect(isRateLimited(key, { maxAttempts: 2 })).toBe(false);
    recordFailedAttempt(key, { maxAttempts: 2 });
    expect(isRateLimited(key, { maxAttempts: 2 })).toBe(false);
    recordFailedAttempt(key, { maxAttempts: 2 });
    expect(isRateLimited(key, { maxAttempts: 2 })).toBe(true);
    // peeking repeatedly must not change state
    expect(isRateLimited(key, { maxAttempts: 2 })).toBe(true);
  });

  it("caps the bucket map instead of growing unboundedly", () => {
    // Simulates an attacker cycling unique keys (emails/IPs): filling far past
    // the cap must not throw and older buckets get evicted, so a key inserted
    // early no longer pins memory.
    for (let i = 0; i < 25_000; i++) {
      checkRateLimit(`test:flood:${i}`, { maxAttempts: 1 });
    }
    // The very first flood key was evicted, so a fresh attempt is allowed again.
    expect(checkRateLimit("test:flood:0", { maxAttempts: 1 })).toBe(true);
  });
});
