import type { Ratelimit } from "@upstash/ratelimit";

export type RateLimitBlock = {
  retryAfterSec: number;
  limit: number;
  remaining: number;
};

/**
 * Returns block info if over limit. If Redis is disabled or errors, returns null (fail open).
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  key: string,
): Promise<RateLimitBlock | null> {
  if (!limiter) {
    return null;
  }
  try {
    const { success, limit, remaining, reset } = await limiter.limit(key);
    if (success) {
      return null;
    }
    const retryAfterSec = reset
      ? Math.max(1, Math.ceil((reset - Date.now()) / 1000))
      : 60;
    return { retryAfterSec, limit, remaining };
  } catch (e) {
    console.error("[rate-limit] checkRateLimit error:", e);
    return null;
  }
}
