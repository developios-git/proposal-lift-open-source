import type { NextRequest } from "next/server";
import {
  allowedExtensionIds,
  allowsAnyExtensionIdInDevelopment,
} from "@/lib/extension/extension-id";

const UPWORK_PAGE_ORIGINS = new Set([
  "https://www.upwork.com",
  "https://upwork.com",
]);

/**
 * **Never add `Access-Control-Allow-Credentials` here.**
 *
 * Both callers authenticate with a Bearer token — `getAuthHeaders()` in the
 * extension — and a Bearer token is not a credential in the CORS sense, so
 * nothing on this path needs it. Every route that merges these headers resolves
 * its user through `createSupabaseForApiRequest`, which falls back to the
 * *cookie* session when no `Authorization` header arrives. Allowing credentials
 * would therefore hand `https://www.upwork.com` — an origin allowed below, and
 * one that runs third-party script — the ability to call a user's own server as
 * them and read the reply: their email, every persona and template, and
 * unlimited generation billed to their own API key.
 *
 * SameSite=Lax on the Supabase auth cookie stops that today, but that default
 * lives in `supabase/server.ts` and has no idea this file exists. Withholding
 * the header is the half of the defence that does not depend on it.
 */
function extensionAllowedCorsHeaders(
  allowOrigin: string,
): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
  };
}

/**
 * CORS for extension-related API routes.
 *
 * Two kinds of caller, both legitimate:
 *
 * - `chrome-extension://…` — the service worker. It reaches a self-hoster's
 *   domain with no host permission at all, which works precisely *because* the
 *   server answers its preflight here. This function is therefore not a
 *   hardening measure bolted onto the extension; it is how the extension is
 *   able to talk to an origin it has never heard of.
 * - `https://www.upwork.com` / `https://upwork.com` — the content script. A
 *   content script's `fetch` carries the *page's* origin, not the extension's,
 *   so it is governed by ordinary CORS too.
 *
 * The allowlist is read per request rather than at module load: `next dev` does
 * not re-import this file when `.env.local` changes, and an id that only takes
 * effect after a full restart is an id someone will spend an afternoon on.
 */
export function extensionCorsHeaders(
  request: NextRequest,
): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin) {
    return {};
  }
  if (/^chrome-extension:\/\//i.test(origin)) {
    const ids = allowedExtensionIds();
    if (ids.some((id) => origin === `chrome-extension://${id}`)) {
      return extensionAllowedCorsHeaders(origin);
    }
    // Unpacked development builds get a Chrome-generated id that cannot be
    // known before the extension is loaded. Everywhere else, an unrecognised
    // extension is exactly what this check exists to turn away.
    if (allowsAnyExtensionIdInDevelopment()) {
      return extensionAllowedCorsHeaders(origin);
    }
    return {};
  }
  if (UPWORK_PAGE_ORIGINS.has(origin)) {
    return extensionAllowedCorsHeaders(origin);
  }
  return {};
}

export function mergeCors(
  request: NextRequest,
  headers: HeadersInit,
): HeadersInit {
  return { ...extensionCorsHeaders(request), ...headers };
}
