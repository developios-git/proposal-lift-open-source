import { describe, it, expect } from "vitest";
import {
  APPLICANTS_RANGE_MAX,
  getCompetitionLevel,
  getCompetitionTooltip,
  hasActiveApplicantRange,
} from "./competition-level";

describe("getCompetitionLevel", () => {
  it("treats 0 through 19 as low", () => {
    expect(getCompetitionLevel(0)).toBe("low");
    expect(getCompetitionLevel(1)).toBe("low");
    expect(getCompetitionLevel(19)).toBe("low");
  });

  it("treats 20 through 30 as medium", () => {
    expect(getCompetitionLevel(20)).toBe("medium");
    expect(getCompetitionLevel(25)).toBe("medium");
    expect(getCompetitionLevel(30)).toBe("medium");
  });

  it("treats 31 and above as high", () => {
    expect(getCompetitionLevel(31)).toBe("high");
    expect(getCompetitionLevel(164)).toBe("high");
    expect(getCompetitionLevel(5000)).toBe("high");
  });

  it("returns null for an unknown count rather than guessing zero", () => {
    expect(getCompetitionLevel(null)).toBeNull();
    expect(getCompetitionLevel(undefined)).toBeNull();
  });

  it("returns null for values that are not usable numbers", () => {
    expect(getCompetitionLevel(NaN)).toBeNull();
    expect(getCompetitionLevel(Infinity)).toBeNull();
    expect(getCompetitionLevel(-1)).toBeNull();
  });
});

describe("getCompetitionTooltip", () => {
  it("describes the count and the level", () => {
    expect(getCompetitionTooltip(47)).toBe("47 applicants, high competition");
    expect(getCompetitionTooltip(25)).toBe("25 applicants, medium competition");
    expect(getCompetitionTooltip(8)).toBe("8 applicants, low competition");
  });

  it("uses the singular noun for one applicant", () => {
    expect(getCompetitionTooltip(1)).toBe("1 applicant, low competition");
  });

  it("has nothing to say about an unknown count", () => {
    expect(getCompetitionTooltip(null)).toBeNull();
  });
});

describe("hasActiveApplicantRange", () => {
  it("is inactive for the full default range", () => {
    expect(hasActiveApplicantRange(0, APPLICANTS_RANGE_MAX)).toBe(false);
    expect(hasActiveApplicantRange(null, null)).toBe(false);
  });

  it("is active once either handle moves inward", () => {
    expect(hasActiveApplicantRange(2, APPLICANTS_RANGE_MAX)).toBe(true);
    expect(hasActiveApplicantRange(0, 198)).toBe(true);
    expect(hasActiveApplicantRange(10, 40)).toBe(true);
  });
});
