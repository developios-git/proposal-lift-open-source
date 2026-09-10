import type { NextRequest } from "next/server";

/** Client IP for rate limiting (first x-forwarded-for hop, then x-real-ip). */
export function getClientIpForRateLimit(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
