import { NextResponse, type NextRequest } from "next/server";
import { getClientIpForRateLimit } from "@/lib/rate-limit/client-ip";
import {
  getAuthIpRatelimit,
  getHandoffIpRatelimit,
} from "@/lib/rate-limit/limiters";
import { checkRateLimit } from "@/lib/rate-limit/check";

const AUTH_POST_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/forget-password",
  "/api/auth/resend-verification",
  "/api/auth/reset-password",
  "/api/auth/change-password",
]);

const HANDOFF_REDEEM_PATH = "/api/extension/handoff/redeem";

/**
 * Edge-safe rate limit for sensitive POST routes (IP-based). Fail open if Redis unavailable.
 */
export async function tryMiddlewareRateLimit(
  request: NextRequest,
): Promise<NextResponse | null> {
  if (request.method !== "POST") {
    return null;
  }
  const path = request.nextUrl.pathname;

  let limiter = null;
  if (AUTH_POST_PATHS.has(path)) {
    limiter = getAuthIpRatelimit();
  } else if (path === HANDOFF_REDEEM_PATH) {
    limiter = getHandoffIpRatelimit();
  } else {
    return null;
  }

  const ip = getClientIpForRateLimit(request);
  const block = await checkRateLimit(limiter, `ip:${ip}`);
  if (!block) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Too many requests. Try again later.",
      code: "RATE_LIMITED",
      retryAfter: block.retryAfterSec,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(block.retryAfterSec),
        "X-RateLimit-Limit": String(block.limit),
        "X-RateLimit-Remaining": String(block.remaining),
      },
    },
  );
}
