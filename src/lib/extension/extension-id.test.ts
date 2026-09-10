import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedExtensionIds, publishedExtensionId } from "./extension-id";

/** Chrome ids are 32 characters drawn from a-p. */
const ID = "abcdefghijklmnopabcdefghijklmnop";
const OTHER_ID = "ponmlkjihgfedcbaponmlkjihgfedcba";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("allowedExtensionIds", () => {
  it("reads the configured id", () => {
    vi.stubEnv("PUBLISHED_EXTENSION_ID", ID);
    expect(allowedExtensionIds()).toEqual([ID]);
  });

  it("splits a comma-separated list and trims each id", () => {
    vi.stubEnv("PUBLISHED_EXTENSION_ID", ` ${ID} , ${OTHER_ID} `);
    expect(allowedExtensionIds()).toEqual([ID, OTHER_ID]);
  });

  /**
   * The id is configuration, so an instance that never set it trusts nothing.
   * `extensionCorsHeaders` and `isAllowedExtensionRedirectUri` both turn every
   * extension away on an empty list, which is the fail-closed half of this.
   */
  it("yields nothing when unset, empty, or whitespace", () => {
    for (const value of [undefined, "", "   ", " , , "]) {
      vi.stubEnv("PUBLISHED_EXTENSION_ID", value);
      expect(allowedExtensionIds()).toEqual([]);
    }
  });
});

describe("publishedExtensionId", () => {
  it("is the configured id", () => {
    vi.stubEnv("PUBLISHED_EXTENSION_ID", ID);
    expect(publishedExtensionId()).toBe(ID);
  });

  it("is the first of a list", () => {
    vi.stubEnv("PUBLISHED_EXTENSION_ID", `${ID},${OTHER_ID}`);
    expect(publishedExtensionId()).toBe(ID);
  });

  /** `chromeWebStoreUrl` turns this into `null`, so the page links nowhere. */
  it("is empty when nothing is configured", () => {
    vi.stubEnv("PUBLISHED_EXTENSION_ID", undefined);
    expect(publishedExtensionId()).toBe("");
  });
});
