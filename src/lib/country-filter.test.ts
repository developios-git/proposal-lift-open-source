import { describe, expect, it } from "vitest";
import {
  filterCountriesBySearch,
  iso2ForCanonical,
  jobMatchesCountryFilters,
  normalizeJobCountryToCanonical,
} from "./country-filter";

describe("iso2ForCanonical", () => {
  it("returns ISO alpha-2 for known canonicals", () => {
    expect(iso2ForCanonical("United States")).toBe("US");
    expect(iso2ForCanonical("United Kingdom")).toBe("GB");
  });
});

describe("normalizeJobCountryToCanonical", () => {
  it("maps US aliases to United States", () => {
    expect(normalizeJobCountryToCanonical("US")).toBe("United States");
    expect(normalizeJobCountryToCanonical("USA")).toBe("United States");
    expect(normalizeJobCountryToCanonical("United States")).toBe(
      "United States",
    );
  });

  it("maps UK aliases to United Kingdom", () => {
    expect(normalizeJobCountryToCanonical("UK")).toBe("United Kingdom");
    expect(normalizeJobCountryToCanonical("GBR")).toBe("United Kingdom");
    expect(normalizeJobCountryToCanonical("United Kingdom")).toBe(
      "United Kingdom",
    );
  });

  it("returns null for empty or unknown", () => {
    expect(normalizeJobCountryToCanonical(null)).toBeNull();
    expect(normalizeJobCountryToCanonical("")).toBeNull();
    expect(normalizeJobCountryToCanonical("   ")).toBeNull();
  });
});

describe("filterCountriesBySearch", () => {
  it("returns all when query empty", () => {
    expect(filterCountriesBySearch("").length).toBeGreaterThan(50);
  });

  it("matches partial canonical name", () => {
    const r = filterCountriesBySearch("uni");
    expect(r).toContain("United States");
    expect(r).toContain("United Kingdom");
    expect(r).toContain("United Arab Emirates");
  });

  it("matches alias fragments via search blob", () => {
    const r = filterCountriesBySearch("usa");
    expect(r).toContain("United States");
  });
});

describe("jobMatchesCountryFilters", () => {
  it("allows all when include and exclude empty", () => {
    expect(jobMatchesCountryFilters("USA", [], [])).toBe(true);
    expect(jobMatchesCountryFilters(null, [], [])).toBe(true);
  });

  it("include restricts to listed canonicals", () => {
    expect(
      jobMatchesCountryFilters("USA", ["United States"], []),
    ).toBe(true);
    expect(
      jobMatchesCountryFilters("United Kingdom", ["United States"], []),
    ).toBe(false);
    expect(jobMatchesCountryFilters(null, ["United States"], [])).toBe(false);
  });

  it("exclude removes after include semantics", () => {
    expect(
      jobMatchesCountryFilters(
        "UK",
        ["United States", "United Kingdom"],
        ["United Kingdom"],
      ),
    ).toBe(false);
    expect(
      jobMatchesCountryFilters(
        "US",
        ["United States", "United Kingdom"],
        ["United Kingdom"],
      ),
    ).toBe(true);
  });

  it("exclude only hides listed countries", () => {
    expect(jobMatchesCountryFilters("UK", [], ["United Kingdom"])).toBe(false);
    expect(jobMatchesCountryFilters("US", [], ["United Kingdom"])).toBe(true);
    expect(jobMatchesCountryFilters(null, [], ["United Kingdom"])).toBe(true);
  });
});
