import { describe, expect, it } from "vitest";
import { MAX_FILTERS_PER_USER, atFilterLimit } from "./filter-limits";

describe("MAX_FILTERS_PER_USER", () => {
  // The one place the number is pinned; the cases below derive from it.
  it("is 4", () => {
    expect(MAX_FILTERS_PER_USER).toBe(4);
  });
});

describe("atFilterLimit", () => {
  it("allows creating while under the cap", () => {
    for (let owned = 0; owned < MAX_FILTERS_PER_USER; owned++) {
      expect(atFilterLimit(owned)).toBe(false);
    }
  });

  it("blocks creating once the cap is reached", () => {
    expect(atFilterLimit(MAX_FILTERS_PER_USER)).toBe(true);
  });

  // Same "block growth, never truncate" rule the keyword cap follows: a user
  // who already owns more than the cap keeps every filter, and is only
  // stopped from adding another.
  it("blocks a user already over the cap", () => {
    expect(atFilterLimit(MAX_FILTERS_PER_USER + 2)).toBe(true);
  });
});
