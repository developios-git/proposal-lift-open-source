import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { extensionCorsHeaders, mergeCors } from "./cors";

/** Chrome ids are 32 characters drawn from a-p. */
const ID = "abcdefghijklmnopabcdefghijklmnop";
const OTHER_ID = "ponmlkjihgfedcbaponmlkjihgfedcba";
const EXT_ORIGIN = `chrome-extension://${ID}`;

/**
 * `allowedExtensionIds()` reads env at call time, so each test sets the world it
 * wants. `NODE_ENV` is "test" under vitest, which keeps the development escape
 * hatch closed unless a test opens it explicitly.
 */
function configure(ids: string | undefined, nodeEnv = "test") {
  vi.stubEnv("PUBLISHED_EXTENSION_ID", ids);
  vi.stubEnv("NODE_ENV", nodeEnv);
}

/** Only `headers.get("origin")` is ever read, so that is all this needs. */
function requestFrom(origin: string | null): NextRequest {
  return {
    headers: new Headers(origin ? { origin } : {}),
  } as unknown as NextRequest;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("extensionCorsHeaders", () => {
  /**
   * The reason this file exists.
   *
   * Every route that opts into these headers authenticates through
   * `createSupabaseForApiRequest`, which falls back to the *cookie* session when
   * no `Authorization` header is present. Allowing credentials would therefore
   * let any script on upwork.com call a user's own server as them and read the
   * answer — their email, every persona and template, and unlimited generation
   * billed to their own API key.
   *
   * Nothing needs it: the service worker and the content script both send a
   * Bearer token, and a Bearer token is not a credential in the CORS sense.
   * SameSite=Lax on the auth cookie stops this today, but that default lives in
   * `supabase/server.ts` and knows nothing about this file. This is the check
   * that does not depend on it.
   */
  it("never allows credentials, for any accepted origin", () => {
    configure(ID);
    for (const origin of [
      EXT_ORIGIN,
      "https://www.upwork.com",
      "https://upwork.com",
    ]) {
      const headers = extensionCorsHeaders(requestFrom(origin));
      expect(headers["Access-Control-Allow-Origin"]).toBe(origin);
      expect(headers).not.toHaveProperty("Access-Control-Allow-Credentials");
    }
  });

  it("still allows the configured extension origin", () => {
    configure(ID);
    const headers = extensionCorsHeaders(requestFrom(EXT_ORIGIN));
    expect(headers["Access-Control-Allow-Origin"]).toBe(EXT_ORIGIN);
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Authorization");
  });

  it("accepts any id in a comma-separated list", () => {
    configure(`${OTHER_ID},${ID}`);
    expect(
      extensionCorsHeaders(requestFrom(EXT_ORIGIN))[
        "Access-Control-Allow-Origin"
      ],
    ).toBe(EXT_ORIGIN);
  });

  it("turns away an unrecognised extension id", () => {
    configure(OTHER_ID);
    expect(extensionCorsHeaders(requestFrom(EXT_ORIGIN))).toEqual({});
  });

  it("turns away an unconfigured server outside development", () => {
    configure(undefined);
    expect(extensionCorsHeaders(requestFrom(EXT_ORIGIN))).toEqual({});
  });

  it("turns away any other origin", () => {
    configure(ID);
    for (const origin of [
      "https://evil.example",
      "https://www.upwork.com.evil.example",
      "https://notupwork.com",
      "http://www.upwork.com",
    ]) {
      expect(extensionCorsHeaders(requestFrom(origin))).toEqual({});
    }
  });

  it("returns nothing when there is no Origin header", () => {
    configure(ID);
    expect(extensionCorsHeaders(requestFrom(null))).toEqual({});
  });

  it("accepts an unknown extension id in development only", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    configure(undefined, "development");
    const headers = extensionCorsHeaders(requestFrom(EXT_ORIGIN));
    expect(headers["Access-Control-Allow-Origin"]).toBe(EXT_ORIGIN);
    // The escape hatch widens *which* origin is accepted, never what it may do.
    expect(headers).not.toHaveProperty("Access-Control-Allow-Credentials");
  });
});

describe("mergeCors", () => {
  it("keeps the route's own headers alongside the CORS ones", () => {
    configure(ID);
    const merged = mergeCors(requestFrom(EXT_ORIGIN), {
      "Content-Type": "application/json",
    }) as Record<string, string>;
    expect(merged["Content-Type"]).toBe("application/json");
    expect(merged["Access-Control-Allow-Origin"]).toBe(EXT_ORIGIN);
    expect(merged).not.toHaveProperty("Access-Control-Allow-Credentials");
  });

  it("yields only the route's headers for a rejected origin", () => {
    configure(ID);
    expect(
      mergeCors(requestFrom("https://evil.example"), {
        "Content-Type": "application/json",
      }),
    ).toEqual({ "Content-Type": "application/json" });
  });
});
