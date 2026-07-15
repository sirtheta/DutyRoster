import { config } from "@/lib/config";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** In-memory sliding-window rate limiter (single-process app, no Redis needed). */
export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.rateLimit.windowMs });
    return true;
  }
  if (bucket.count >= config.rateLimit.maxAttempts) return false;
  bucket.count++;
  return true;
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
