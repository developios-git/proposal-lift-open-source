import { describe, it, expect } from "vitest";
import {
  isSavedFilterFeedEligible,
  savedFilterIsEnabled,
} from "./saved-filter-feed-eligible";

const withTerms = { keywords: { terms: ["react"] } };

describe("savedFilterIsEnabled", () => {
  it("is true when the column is true", () => {
    expect(savedFilterIsEnabled({ is_enabled: true })).toBe(true);
  });

  it("is false only for an explicit false", () => {
    expect(savedFilterIsEnabled({ is_enabled: false })).toBe(false);
  });

  it("fails open on null, which can only come from a select that omitted the column", () => {
    expect(savedFilterIsEnabled({ is_enabled: null })).toBe(true);
  });
});

describe("isSavedFilterFeedEligible", () => {
  it("accepts an enabled filter that carries keyword terms", () => {
    expect(
      isSavedFilterFeedEligible({ is_enabled: true, filters: withTerms }),
    ).toBe(true);
  });

  it("rejects a disabled filter even when it carries keyword terms", () => {
    expect(
      isSavedFilterFeedEligible({ is_enabled: false, filters: withTerms }),
    ).toBe(false);
  });

  it("rejects an enabled filter with no keyword terms", () => {
    expect(
      isSavedFilterFeedEligible({
        is_enabled: true,
        filters: { keywords: { terms: [] } },
      }),
    ).toBe(false);
    expect(isSavedFilterFeedEligible({ is_enabled: true, filters: {} })).toBe(
      false,
    );
  });

  it("rejects an enabled filter whose only term is whitespace", () => {
    expect(
      isSavedFilterFeedEligible({
        is_enabled: true,
        filters: { keywords: { terms: ["   "] } },
      }),
    ).toBe(false);
  });

  it("treats a null is_enabled as enabled so a missing column cannot blank a feed", () => {
    expect(
      isSavedFilterFeedEligible({ is_enabled: null, filters: withTerms }),
    ).toBe(true);
  });
});
