import dns from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import net from "node:net";

/** Thrown when URL target fails SSRF policy (message may be shown to clients as generic error). */
export class PublicUrlFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicUrlFetchError";
  }
}

function ipv4ToUint(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

/** Block private, loopback, link-local, CGNAT, multicast/reserved (per SSRF hardening). */
export function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToUint(ip);
  if (n === null) return true;

  const a = n >>> 24;
  const b = (n >>> 16) & 255;

  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if ((n >>> 16) === 0xc0a8) return true;
  if ((n >>> 16) === 0xa9fe) return true;
  if (a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;

  return false;
}

/** IPv4-mapped suffix e.g. ::ffff:127.0.0.1 */
function ipv4FromMappedIpv6(ipLower: string): string | null {
  const prefix = "::ffff:";
  if (!ipLower.startsWith(prefix)) return null;
  const v4 = ipLower.slice(prefix.length);
  return net.isIPv4(v4) ? v4 : null;
}

export function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  const mapped = ipv4FromMappedIpv6(lower);
  if (mapped) return isBlockedIpv4(mapped);

  if (lower === "::1") return true;

  const firstSeg = lower.split(":").find(Boolean);
  if (!firstSeg || !/^[0-9a-f]{1,4}$/i.test(firstSeg)) {
    return false;
  }
  const first = parseInt(firstSeg, 16);
  if (first >= 0xfe80 && first <= 0xfebf) return true;
  if (first >= 0xfc00 && first <= 0xfdff) return true;
  if (first >= 0xff00) return true;

  return false;
}

export function isBlockedIpAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (net.isIPv6(ip)) return isBlockedIpv6(ip);
  return true;
}

/**
 * Ensures URL uses HTTPS, has no user credentials, and resolves only to non-blocked IPs.
 */
export async function assertPublicHttpsUrl(url: URL): Promise<void> {
  if (url.protocol !== "https:") {
    throw new PublicUrlFetchError("Only HTTPS URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new PublicUrlFetchError("URLs with credentials are not allowed.");
  }

  const hostname = url.hostname;
  if (!hostname) {
    throw new PublicUrlFetchError("Invalid URL host.");
  }

  if (net.isIPv4(hostname) || net.isIPv6(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      throw new PublicUrlFetchError("Target address is not allowed.");
    }
    return;
  }

  let records: LookupAddress[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new PublicUrlFetchError("Could not resolve host.");
  }

  if (!records.length) {
    throw new PublicUrlFetchError("Could not resolve host.");
  }

  for (const r of records) {
    if (isBlockedIpAddress(r.address)) {
      throw new PublicUrlFetchError("Target address is not allowed.");
    }
  }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type SafeFetchPublicHttpsOptions = RequestInit & {
  maxRedirects?: number;
  maxResponseBytes?: number;
};

/**
 * GET-style fetch: HTTPS only, validates each hop after redirects, caps response body size.
 */
export async function safeFetchPublicHttps(
  startUrl: string,
  options: SafeFetchPublicHttpsOptions = {},
): Promise<{ response: Response; bodyText: string; finalUrl: URL }> {
  const maxRedirects = options.maxRedirects ?? 5;
  const maxResponseBytes = options.maxResponseBytes ?? 2_000_000;
  const { maxRedirects: _mr, maxResponseBytes: _mb, ...requestInit } =
    options;

  let current: URL;
  try {
    current = new URL(startUrl);
  } catch {
    throw new PublicUrlFetchError("Invalid URL.");
  }

  await assertPublicHttpsUrl(current);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const response = await fetch(current.toString(), {
      ...requestInit,
      method: "GET",
      redirect: "manual",
    });

    if (REDIRECT_STATUSES.has(response.status)) {
      const loc = response.headers.get("location");
      if (!loc || hop >= maxRedirects) {
        throw new PublicUrlFetchError("Too many redirects or invalid redirect.");
      }
      current = new URL(loc, current);
      await assertPublicHttpsUrl(current);
      continue;
    }

    const bodyText = await readResponseTextLimited(
      response,
      maxResponseBytes,
    );
    return { response, bodyText, finalUrl: current };
  }

  throw new PublicUrlFetchError("Too many redirects.");
}

async function readResponseTextLimited(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > maxBytes) {
          await reader.cancel();
          throw new PublicUrlFetchError("Response too large.");
        }
        out += decoder.decode(value, { stream: true });
      }
    }
    out += decoder.decode();
    return out;
  } catch (e) {
    if (e instanceof PublicUrlFetchError) throw e;
    throw new PublicUrlFetchError("Failed to read response body.");
  }
}
