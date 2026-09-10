/**
 * Prevent open redirects on auth/callback `next` (and similar).
 * Only same-origin relative paths are allowed.
 */
export function safeAuthRedirectPath(next: string | null | undefined): string {
  const fallback = "/dashboard";
  if (!next || typeof next !== "string") return fallback;
  const t = next.trim();
  if (!t.startsWith("/")) return fallback;
  if (t.startsWith("//")) return fallback;
  if (t.includes("\\")) return fallback;
  if (/^\/\/[^/]/i.test(t)) return fallback;
  const lower = t.toLowerCase();
  if (lower.startsWith("/http:") || lower.startsWith("/https:")) return fallback;
  return t;
}
