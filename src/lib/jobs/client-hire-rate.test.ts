import { describe, it, expect } from "vitest";
import {
  computeClientHireRate,
  formatClientHireRate,
  jobMatchesHireRateMin,
} from "./client-hire-rate";

describe("computeClientHireRate", () => {
  it("returns the rounded percentage of posts that ended in a hire", () => {
    expect(computeClientHireRate(3, 8)).toBe(38); // 37.5 rounds up
    expect(computeClientHireRate(1, 4)).toBe(25);
    expect(computeClientHireRate(9, 10)).toBe(90);
    expect(computeClientHireRate(5, 5)).toBe(100);
  });

  it("returns a real 0 for a client who posts but never hires", () => {
    expect(computeClientHireRate(0, 8)).toBe(0);
  });

  it("caps above 100, since one post can hire several freelancers", () => {
    expect(computeClientHireRate(3, 2)).toBe(100);
    expect(computeClientHireRate(50, 1)).toBe(100);
  });

  it("returns null when the client has posted nothing to divide by", () => {
    expect(computeClientHireRate(0, 0)).toBeNull();
    expect(computeClientHireRate(2, 0)).toBeNull();
    expect(computeClientHireRate(0, -1)).toBeNull();
  });

  it("returns null when either field is absent rather than assuming zero", () => {
    expect(computeClientHireRate(null, 8)).toBeNull();
    expect(computeClientHireRate(3, null)).toBeNull();
    expect(computeClientHireRate(undefined, undefined)).toBeNull();
  });

  it("returns null for values that are not usable numbers", () => {
    expect(computeClientHireRate(NaN, 8)).toBeNull();
    expect(computeClientHireRate(3, Infinity)).toBeNull();
    expect(computeClientHireRate(-1, 8)).toBeNull();
  });
});

describe("jobMatchesHireRateMin", () => {
  it("passes everything when no minimum is set", () => {
    expect(jobMatchesHireRateMin(10, 0)).toBe(true);
    expect(jobMatchesHireRateMin(null, 0)).toBe(true);
    expect(jobMatchesHireRateMin(10, null)).toBe(true);
    expect(jobMatchesHireRateMin(10, undefined)).toBe(true);
  });

  it("passes a job whose rate is at or above the minimum", () => {
    expect(jobMatchesHireRateMin(50, 50)).toBe(true);
    expect(jobMatchesHireRateMin(75, 50)).toBe(true);
    expect(jobMatchesHireRateMin(100, 100)).toBe(true);
  });

  it("rejects a job whose rate is below the minimum", () => {
    expect(jobMatchesHireRateMin(38, 50)).toBe(false);
    expect(jobMatchesHireRateMin(0, 1)).toBe(false);
  });

  it("keeps jobs with no derivable rate, since missing data is not a low rate", () => {
    expect(jobMatchesHireRateMin(null, 50)).toBe(true);
    expect(jobMatchesHireRateMin(null, 100)).toBe(true);
  });

  it("rejects a client who has posted but never hired", () => {
    // 0 hires across 8 posts is a real 0, unlike an absent rate.
    expect(jobMatchesHireRateMin(computeClientHireRate(0, 8), 50)).toBe(false);
    expect(jobMatchesHireRateMin(computeClientHireRate(null, null), 50)).toBe(true);
  });
});

describe("formatClientHireRate", () => {
  it("renders the percentage with its label", () => {
    expect(formatClientHireRate(38)).toBe("38% hire rate");
    expect(formatClientHireRate(0)).toBe("0% hire rate");
    expect(formatClientHireRate(100)).toBe("100% hire rate");
  });

  it("renders nothing when the rate is not derivable", () => {
    expect(formatClientHireRate(null)).toBeNull();
  });
});
