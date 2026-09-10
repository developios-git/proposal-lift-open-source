const MAX_URL_LENGTH = 2048;

// RFC1918 private ranges, loopback, link-local, and APIPA
const BLOCKED_PATTERNS = [
  // IPv4 loopback
  /^127\./,
  // RFC1918 class A
  /^10\./,
  // RFC1918 class B (172.16.0.0 – 172.31.255.255)
  /^172\.(1[6-9]|2\d|3[01])\./,
  // RFC1918 class C
  /^192\.168\./,
  // APIPA / link-local
  /^169\.254\./,
  // Multicast
  /^224\./,
  /^239\./,
  // Broadcast / "this" network
  /^0\./,
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
]);

// IPv6 loopback / link-local prefixes (lowercased, bracket-stripped)
const BLOCKED_IPV6_PREFIXES = [
  "::1",
  "fc",
  "fd",
  "fe80",
  "::",
];

function isBlockedIp(hostname: string): boolean {
  // Strip IPv6 brackets: [::1] → ::1
  const h = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1).toLowerCase()
    : hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(h)) return true;

  // Plain IPv4 checks
  if (BLOCKED_PATTERNS.some((re) => re.test(h))) return true;

  // IPv6 checks
  if (
    h === "::1" ||
    h.startsWith("::ffff:") || // IPv4-mapped
    BLOCKED_IPV6_PREFIXES.some((prefix) => h.startsWith(prefix))
  ) {
    return true;
  }

  return false;
}

export type UrlValidationResult =
  | { valid: true }
  | { valid: false; error: string };

/**
 * Validate a webhook URL for safe outbound delivery.
 *
 * Rules:
 * - Must be an https:// URL (http is rejected).
 * - Hostname must not resolve to a private/loopback/link-local IP range
 *   (SSRF protection — checked by pattern on the literal hostname value).
 * - URL must not exceed 2048 characters.
 * - Must have a non-empty hostname.
 *
 * Note: this performs static hostname analysis only (no live DNS resolution).
 * For Make.com, n8n, and public webhook services the hostname is a FQDN that
 * will not match any private-IP pattern. DNS rebinding attacks are out of scope
 * for this server-side context (the cron fires to pre-validated, user-owned URLs).
 */
export function validateWebhookUrl(url: string): UrlValidationResult {
  if (!url || typeof url !== "string") {
    return { valid: false, error: "URL is required." };
  }

  if (url.length > MAX_URL_LENGTH) {
    return {
      valid: false,
      error: `URL must be ${MAX_URL_LENGTH} characters or fewer.`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "URL is not valid." };
  }

  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      error: "Webhook URL must use HTTPS.",
    };
  }

  const hostname = parsed.hostname;

  if (!hostname) {
    return { valid: false, error: "URL must include a hostname." };
  }

  if (isBlockedIp(hostname)) {
    return {
      valid: false,
      error:
        "Webhook URL must point to a public host. Private, loopback, and link-local addresses are not allowed.",
    };
  }

  return { valid: true };
}
