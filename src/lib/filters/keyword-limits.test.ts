import { describe, expect, it } from "vitest";
import {
  MAX_FILTER_KEYWORD_TERMS,
  MAX_KEYWORD_LENGTH,
  countKeywordTerms,
  exceedsKeywordLength,
  exceedsKeywordLimit,
} from "./keyword-limits";

describe("countKeywordTerms", () => {
  it("counts the include terms", () => {
    expect(countKeywordTerms({ keywords: { terms: ["react", "next.js"] } })).toBe(2);
  });

  it("counts an empty list as zero", () => {
    expect(countKeywordTerms({ keywords: { terms: [] } })).toBe(0);
  });

  it("ignores exclude terms, which are uncapped", () => {
    expect(
      countKeywordTerms({
        keywords: { terms: ["react"], exclude_terms: ["wordpress", "wix", "php"] },
      }),
    ).toBe(1);
  });

  // The `filters` column is unvalidated jsonb, so every shape below can actually
  // reach the routes — each one passes their `typeof filters === "object"` check.
  it.each([
    ["no keywords block", { budget: { min: 50 } }],
    ["keywords without terms", { keywords: { search_in: ["title"] } }],
    ["null terms", { keywords: { terms: null } }],
    ["terms as a string", { keywords: { terms: "react" } }],
    ["null keywords", { keywords: null }],
    ["null filters", null],
    ["an array", []],
    ["undefined", undefined],
    ["a string", "react"],
  ])("returns 0 for %s", (_label, filters) => {
    expect(countKeywordTerms(filters)).toBe(0);
  });

  it("counts a legacy over-limit list at its real length", () => {
    const terms = Array.from({ length: 9 }, (_, i) => `term-${i}`);
    expect(countKeywordTerms({ keywords: { terms } })).toBe(9);
  });

  it("counts non-string entries, so a junk blob cannot smuggle in extra slots", () => {
    expect(countKeywordTerms({ keywords: { terms: ["react", 42, null] } })).toBe(3);
  });
});

describe("MAX_FILTER_KEYWORD_TERMS", () => {
  // The one place the number is pinned; the cases below derive from it, so
  // changing the limit is a one-line edit in keyword-limits.ts plus this.
  it("is 5", () => {
    expect(MAX_FILTER_KEYWORD_TERMS).toBe(5);
  });
});

const withTerms = (n: number) => ({
  keywords: { terms: Array.from({ length: n }, (_, i) => `term-${i}`) },
});

describe("exceedsKeywordLimit", () => {
  const MAX = MAX_FILTER_KEYWORD_TERMS;
  // Stands in for a filter saved before the cap existed.
  const LEGACY = MAX + 3;

  it("allows a save at the limit", () => {
    expect(exceedsKeywordLimit(withTerms(MAX), withTerms(1))).toBe(false);
  });

  it("rejects growth past the limit from under it", () => {
    expect(exceedsKeywordLimit(withTerms(MAX + 1), withTerms(MAX))).toBe(true);
  });

  // The three cases that define "block new adds, keep existing" for filters
  // saved before the cap existed.
  it("rejects growth on an already over-limit filter", () => {
    expect(exceedsKeywordLimit(withTerms(LEGACY + 1), withTerms(LEGACY))).toBe(true);
  });

  it("allows an over-limit filter to be saved unchanged, so it stays editable", () => {
    expect(exceedsKeywordLimit(withTerms(LEGACY), withTerms(LEGACY))).toBe(false);
  });

  it("allows shrinking an over-limit filter even while still over", () => {
    expect(exceedsKeywordLimit(withTerms(LEGACY - 1), withTerms(LEGACY))).toBe(false);
  });

  it("treats a missing prior filter as a fresh one, so the cap is a plain ceiling", () => {
    expect(exceedsKeywordLimit(withTerms(MAX), null)).toBe(false);
    expect(exceedsKeywordLimit(withTerms(MAX + 1), null)).toBe(true);
    expect(exceedsKeywordLimit(withTerms(MAX + 1), undefined)).toBe(true);
  });

  it("ignores exclude terms on both sides", () => {
    const next = {
      keywords: { terms: ["a"], exclude_terms: Array.from({ length: 20 }, () => "x") },
    };
    expect(exceedsKeywordLimit(next, null)).toBe(false);
  });
});

describe("MAX_KEYWORD_LENGTH", () => {
  // Pinned here so changing the cap is a deliberate two-line edit, matching
  // how MAX_FILTER_KEYWORD_TERMS is treated above.
  it("is 30", () => {
    expect(MAX_KEYWORD_LENGTH).toBe(30);
  });
});

const AT_CAP = "a".repeat(MAX_KEYWORD_LENGTH);
const OVER_CAP = "a".repeat(MAX_KEYWORD_LENGTH + 1);

describe("exceedsKeywordLength", () => {
  it("allows a term exactly at the cap", () => {
    expect(exceedsKeywordLength({ keywords: { terms: [AT_CAP] } }, null)).toBe(false);
  });

  it("rejects a term one character over the cap", () => {
    expect(exceedsKeywordLength({ keywords: { terms: [OVER_CAP] } }, null)).toBe(true);
  });

  // Length is measured on the trimmed term because that is what the routes
  // store and what filter-mapper quotes into the Lucene expression.
  it("measures after trimming, so surrounding whitespace cannot push a term over", () => {
    expect(
      exceedsKeywordLength({ keywords: { terms: [`   ${AT_CAP}   `] } }, null),
    ).toBe(false);
  });

  // Unlike the count cap, the length cap covers exclude terms too: an
  // exclude term costs no Upwork spend but is just as unusable at 200 chars.
  it("applies to exclude terms as well as include terms", () => {
    expect(
      exceedsKeywordLength({ keywords: { exclude_terms: [OVER_CAP] } }, null),
    ).toBe(true);
  });

  it("ignores non-string entries, which have no length to check", () => {
    expect(
      exceedsKeywordLength({ keywords: { terms: [42, null, { a: 1 }] } }, null),
    ).toBe(false);
  });

  // Mirrors exceedsKeywordLimit: the cap blocks new over-length terms, it
  // never rewrites what is already stored.
  it("allows an already-saved over-length term to be saved again unchanged", () => {
    const stored = { keywords: { terms: [OVER_CAP] } };
    expect(exceedsKeywordLength(stored, stored)).toBe(false);
  });

  it("rejects a newly added over-length term even when another is grandfathered", () => {
    const existing = { keywords: { terms: [OVER_CAP] } };
    const next = { keywords: { terms: [OVER_CAP, `${OVER_CAP}b`] } };
    expect(exceedsKeywordLength(next, existing)).toBe(true);
  });

  it("grandfathers a stored term moved from include to exclude", () => {
    const existing = { keywords: { terms: [OVER_CAP] } };
    const next = { keywords: { terms: [], exclude_terms: [OVER_CAP] } };
    expect(exceedsKeywordLength(next, existing)).toBe(false);
  });

  it("treats a missing prior filter as a plain ceiling", () => {
    expect(exceedsKeywordLength({ keywords: { terms: [OVER_CAP] } }, undefined)).toBe(true);
  });

  // The same unvalidated-jsonb shapes countKeywordTerms has to survive.
  it.each([
    ["no keywords block", { budget: { min: 50 } }],
    ["keywords without terms", { keywords: { search_in: ["title"] } }],
    ["null terms", { keywords: { terms: null } }],
    ["terms as a string", { keywords: { terms: "react" } }],
    ["null keywords", { keywords: null }],
    ["null filters", null],
    ["an array", []],
    ["undefined", undefined],
    ["a string", "react"],
  ])("returns false for %s", (_label, filters) => {
    expect(exceedsKeywordLength(filters, null)).toBe(false);
  });
});
