/**
 * Best-effort in-memory per-IP sliding-window rate limiter.
 *
 * On serverless this limits per warm instance rather than globally — it
 * discourages casual abuse but is not a hard guarantee. For strict limits,
 * swap in an external store (e.g. Upstash Redis).
 */

const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  limit: number;
}

export function checkRateLimit(key: string, limit: number): RateLimitResult {
  if (limit <= 0) return { allowed: true, retryAfterSec: 0, limit };

  const now = Date.now();
  let timestamps = buckets.get(key);
  if (!timestamps) {
    timestamps = [];
    buckets.set(key, timestamps);
  }

  // Drop entries outside the window.
  while (timestamps.length > 0 && now - timestamps[0] > WINDOW_MS) timestamps.shift();

  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)), limit };
  }

  timestamps.push(now);

  // Occasional cleanup so the map doesn't grow unbounded on long-lived instances.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.length === 0 || now - v[v.length - 1] > WINDOW_MS) buckets.delete(k);
    }
  }

  return { allowed: true, retryAfterSec: 0, limit };
}
