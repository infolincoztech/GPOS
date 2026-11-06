type RateBucket = {
  count: number;
  resetAt: number;
};

declare global {
  var __gposRateLimiter: Map<string, RateBucket> | undefined;
}

const buckets: Map<string, RateBucket> =
  globalThis.__gposRateLimiter ?? (globalThis.__gposRateLimiter = new Map<string, RateBucket>());

const MAX_BUCKETS = 25000;

export function checkRateLimit(
  identifier: string,
  maxRequests = 120,
  windowMs = 60000
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const existing = buckets.get(identifier);

  if (!existing || now > existing.resetAt) {
    if (buckets.size > MAX_BUCKETS) {
      for (const [k, v] of buckets.entries()) {
        if (now > v.resetAt) buckets.delete(k);
        if (buckets.size <= MAX_BUCKETS * 0.8) break;
      }
    }
    buckets.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterSec: 0 };
  }

  existing.count += 1;
  if (existing.count > maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  return { allowed: true, remaining: maxRequests - existing.count, retryAfterSec: 0 };
}

