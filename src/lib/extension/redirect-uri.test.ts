import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extensionRedirectUri,
  isAllowedExtensionRedirectUri,
} from "./redirect-uri";

/** Chrome ids are 32 characters drawn from a-p. */
const ID = "abcdefghijklmnopabcdefghijklmnop";
const OTHER_ID = "ponmlkjihgfedcbaponmlkjihgfedcba";
const VALID = `https://${ID}.chromiumapp.org/`;

/**
 * `allowedExtensionIds()` reads env at call time, so each test sets the world it
 * wants. `NODE_ENV` is "test" under vitest, which keeps the development escape
 * hatch closed unless a test opens it explicitly.
 */
function configure(ids: string | undefined, nodeEnv = "test") {
  vi.stubEnv("PUBLISHED_EXTENSION_ID", ids);
  vi.stubEnv("NODE_ENV", nodeEnv);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("extensionRedirectUri", () => {
  it("builds the sentinel Chrome redirects to", () => {
    expect(extensionRedirectUri(ID)).toBe(VALID);
  });
});

describe("isAllowedExtensionRedirectUri", () => {
  describe("with a configured id", () => {
    it("accepts the exact redirect uri", () => {
      configure(ID);
      expect(isAllowedExtensionRedirectUri(VALID)).toBe(true);
    });

    it("accepts any id in a comma-separated list, ignoring whitespace", () => {
      configure(` ${OTHER_ID} , ${ID} `);
      expect(isAllowedExtensionRedirectUri(VALID)).toBe(true);
      expect(
        isAllowedExtensionRedirectUri(extensionRedirectUri(OTHER_ID)),
      ).toBe(true);
    });

    it("rejects a different extension id", () => {
      configure(OTHER_ID);
      expect(isAllowedExtensionRedirectUri(VALID)).toBe(false);
    });

    /**
     * The attack this whole module exists to stop: a host that merely *starts*
     * with ours. A `startsWith` or unanchored regex would let this through and
     * hand the handoff code to evil.example.
     */
    it("rejects a suffix-extended host", () => {
      configure(ID);
      expect(
        isAllowedExtensionRedirectUri(
          `https://${ID}.chromiumapp.org.evil.example/`,
        ),
      ).toBe(false);
      expect(
        isAllowedExtensionRedirectUri(
          `https://${ID}.chromiumapp.org.evil.example/path`,
        ),
      ).toBe(false);
    });

    it("rejects a prefixed host", () => {
      configure(ID);
      expect(
        isAllowedExtensionRedirectUri(`https://evil.example/${ID}.chromiumapp.org/`),
      ).toBe(false);
      expect(
        isAllowedExtensionRedirectUri(`https://evil.${ID}.chromiumapp.org/`),
      ).toBe(false);
    });

    it("rejects a userinfo-smuggled host", () => {
      configure(ID);
      expect(
        isAllowedExtensionRedirectUri(
          `https://${ID}.chromiumapp.org@evil.example/`,
        ),
      ).toBe(false);
    });

    it("rejects a missing or duplicated trailing slash", () => {
      configure(ID);
      expect(
        isAllowedExtensionRedirectUri(`https://${ID}.chromiumapp.org`),
      ).toBe(false);
      expect(
        isAllowedExtensionRedirectUri(`https://${ID}.chromiumapp.org//`),
      ).toBe(false);
    });

    it("rejects an appended path, query or fragment", () => {
      configure(ID);
      expect(isAllowedExtensionRedirectUri(`${VALID}callback`)).toBe(false);
      expect(isAllowedExtensionRedirectUri(`${VALID}?code=x`)).toBe(false);
      expect(isAllowedExtensionRedirectUri(`${VALID}#x`)).toBe(false);
    });

    it("rejects any scheme but https", () => {
      configure(ID);
      expect(
        isAllowedExtensionRedirectUri(`http://${ID}.chromiumapp.org/`),
      ).toBe(false);
      expect(
        isAllowedExtensionRedirectUri(`javascript:alert(1)//${ID}`),
      ).toBe(false);
    });

    it("rejects case variations, since the comparison is exact", () => {
      configure(ID);
      expect(isAllowedExtensionRedirectUri(VALID.toUpperCase())).toBe(false);
    });

    it("rejects empty and non-string input", () => {
      configure(ID);
      expect(isAllowedExtensionRedirectUri("")).toBe(false);
      expect(isAllowedExtensionRedirectUri(null)).toBe(false);
      expect(isAllowedExtensionRedirectUri(undefined)).toBe(false);
    });
  });

  describe("with no configured id", () => {
    /**
     * Outside development an unconfigured server trusts nothing. This is the
     * case that used to be "allow everything" in cors.ts, and widening it back
     * would re-open the flow to any extension.
     */
    it("rejects everything, including a well-formed uri", () => {
      configure(undefined);
      expect(isAllowedExtensionRedirectUri(VALID)).toBe(false);
    });

    it("rejects everything when the env var is only whitespace", () => {
      configure("   ");
      expect(isAllowedExtensionRedirectUri(VALID)).toBe(false);
    });

    it("accepts a well-formed uri in development only", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      configure(undefined, "development");
      expect(isAllowedExtensionRedirectUri(VALID)).toBe(true);
    });

    it("still rejects a malformed uri in development", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      configure(undefined, "development");
      expect(
        isAllowedExtensionRedirectUri(
          `https://${ID}.chromiumapp.org.evil.example/`,
        ),
      ).toBe(false);
      expect(isAllowedExtensionRedirectUri("https://short.chromiumapp.org/")).toBe(
        false,
      );
      expect(
        isAllowedExtensionRedirectUri(`https://${ID}z.chromiumapp.org/`),
      ).toBe(false);
    });
  });
});
