import { describe, expect, it } from "vitest";
import {
  hasActiveFreelancerLocationFilter,
  isEurope,
  isUnitedStates,
  jobMatchesFreelancerLocationFilters,
} from "./freelancer-location-filter";

describe("region matching", () => {
  it("recognises US spellings", () => {
    expect(isUnitedStates("United States")).toBe(true);
    expect(isUnitedStates("usa")).toBe(true);
    expect(isUnitedStates("  US  ")).toBe(true);
    expect(isUnitedStates("Canada")).toBe(false);
  });

  it("recognises European countries, UK included", () => {
    expect(isEurope("Germany")).toBe(true);
    expect(isEurope("united kingdom")).toBe(true);
    expect(isEurope("UK")).toBe(true);
    expect(isEurope("Ukraine")).toBe(true);
    expect(isEurope("United States")).toBe(false);
    expect(isEurope("India")).toBe(false);
  });
});

describe("hasActiveFreelancerLocationFilter", () => {
  it("is false for defaults", () => {
    expect(hasActiveFreelancerLocationFilter(undefined)).toBe(false);
    expect(hasActiveFreelancerLocationFilter({})).toBe(false);
    expect(
      hasActiveFreelancerLocationFilter({
        us_filter: "include",
        europe_filter: "include",
      }),
    ).toBe(false);
  });

  it("is true once any region is constrained", () => {
    expect(hasActiveFreelancerLocationFilter({ us_filter: "only" })).toBe(true);
    expect(
      hasActiveFreelancerLocationFilter({ europe_filter: "exclude" }),
    ).toBe(true);
  });
});

describe("jobMatchesFreelancerLocationFilters", () => {
  it("passes everything when no rule is active", () => {
    expect(jobMatchesFreelancerLocationFilters(["India"], {})).toBe(true);
    expect(jobMatchesFreelancerLocationFilters(null, undefined)).toBe(true);
  });

  it("excludes a region the job prefers", () => {
    expect(
      jobMatchesFreelancerLocationFilters(["United States"], {
        us_filter: "exclude",
      }),
    ).toBe(false);
    expect(
      jobMatchesFreelancerLocationFilters(["Germany"], {
        us_filter: "exclude",
      }),
    ).toBe(true);
  });

  it("keeps only jobs preferring the chosen region", () => {
    expect(
      jobMatchesFreelancerLocationFilters(["United States"], {
        us_filter: "only",
      }),
    ).toBe(true);
    expect(
      jobMatchesFreelancerLocationFilters(["India"], { us_filter: "only" }),
    ).toBe(false);
  });

  it("treats two only-rules as a union, not an intersection", () => {
    const filters = {
      us_filter: "only" as const,
      europe_filter: "only" as const,
    };
    expect(jobMatchesFreelancerLocationFilters(["Germany"], filters)).toBe(true);
    expect(
      jobMatchesFreelancerLocationFilters(["United States"], filters),
    ).toBe(true);
    expect(jobMatchesFreelancerLocationFilters(["India"], filters)).toBe(false);
  });

  it("drops no-preference jobs under an only-rule by default", () => {
    expect(
      jobMatchesFreelancerLocationFilters([], { us_filter: "only" }),
    ).toBe(false);
    expect(
      jobMatchesFreelancerLocationFilters(null, { us_filter: "only" }),
    ).toBe(false);
  });

  it("keeps no-preference jobs under an only-rule when opted in", () => {
    expect(
      jobMatchesFreelancerLocationFilters([], {
        us_filter: "only",
        show_without_country_preference: true,
      }),
    ).toBe(true);
  });

  it("never drops a no-preference job for an exclude-rule alone", () => {
    expect(
      jobMatchesFreelancerLocationFilters([], { us_filter: "exclude" }),
    ).toBe(true);
  });

  it("excludes take priority over onlys", () => {
    // Job prefers both; Europe is excluded, so it goes regardless of the US only-rule.
    expect(
      jobMatchesFreelancerLocationFilters(["United States", "Germany"], {
        us_filter: "only",
        europe_filter: "exclude",
      }),
    ).toBe(false);
  });

  it("ignores blank entries in the preference list", () => {
    expect(
      jobMatchesFreelancerLocationFilters(["", "   "], { us_filter: "only" }),
    ).toBe(false);
  });
});
