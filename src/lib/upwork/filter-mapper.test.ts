import { describe, it, expect } from "vitest";
import { buildUpworkFilter } from "./filter-mapper";
import { DEFAULT_FILTER_CRITERIA } from "@/types";
import type { FilterCriteria } from "@/types";

/** Criteria with only `job_terms.applicants` overridden. */
function criteriaWithApplicants(
  applicants: { min: number | null; max: number | null } | undefined,
): FilterCriteria {
  return {
    ...DEFAULT_FILTER_CRITERIA,
    job_terms: {
      ...DEFAULT_FILTER_CRITERIA.job_terms!,
      applicants: applicants as { min: number | null; max: number | null },
    },
  };
}

describe("buildUpworkFilter — applicant range → proposalRange_eq", () => {
  it("omits the filter entirely at the full 0..200 default", () => {
    const filter = buildUpworkFilter(criteriaWithApplicants({ min: 0, max: 200 }));
    expect(filter.proposalRange_eq).toBeUndefined();
  });

  it("omits the filter when applicants is absent", () => {
    const filter = buildUpworkFilter(criteriaWithApplicants(undefined));
    expect(filter.proposalRange_eq).toBeUndefined();
  });

  it("sends both bounds for a narrowed range", () => {
    const filter = buildUpworkFilter(criteriaWithApplicants({ min: 10, max: 40 }));
    expect(filter.proposalRange_eq).toEqual({ rangeStart: 10, rangeEnd: 40 });
  });

  it("treats a max of 200 as \"200+\" by leaving rangeEnd unset", () => {
    const filter = buildUpworkFilter(criteriaWithApplicants({ min: 50, max: 200 }));
    expect(filter.proposalRange_eq).toEqual({ rangeStart: 50 });
    expect(filter.proposalRange_eq).not.toHaveProperty("rangeEnd");
  });

  it("sends only rangeEnd when the minimum is still 0", () => {
    const filter = buildUpworkFilter(criteriaWithApplicants({ min: 0, max: 10 }));
    expect(filter.proposalRange_eq).toEqual({ rangeEnd: 10 });
  });

  it("supports the low-competition case a user would actually pick", () => {
    const filter = buildUpworkFilter(criteriaWithApplicants({ min: 0, max: 6 }));
    expect(filter.proposalRange_eq).toEqual({ rangeEnd: 6 });
  });

  it("falls back to the full range when bounds are null", () => {
    const filter = buildUpworkFilter(
      criteriaWithApplicants({ min: null, max: null }),
    );
    expect(filter.proposalRange_eq).toBeUndefined();
  });
});

describe("buildUpworkFilter — required_connects is no longer a proposals filter", () => {
  /**
   * `proposalRange_eq` constrains by applicant count. It used to be fed from
   * `required_connects` (the connects cost to bid), which is a different
   * quantity and has no Upwork filter at all.
   */
  it("does not emit proposalRange_eq from required_connects", () => {
    const criteria: FilterCriteria = {
      ...DEFAULT_FILTER_CRITERIA,
      job_terms: {
        ...DEFAULT_FILTER_CRITERIA.job_terms!,
        required_connects: { min: 4, max: 16 },
      },
    };
    const filter = buildUpworkFilter(criteria);
    expect(filter.proposalRange_eq).toBeUndefined();
  });

  it("lets the applicant range win when both are set", () => {
    const criteria: FilterCriteria = {
      ...DEFAULT_FILTER_CRITERIA,
      job_terms: {
        ...DEFAULT_FILTER_CRITERIA.job_terms!,
        required_connects: { min: 4, max: 16 },
        applicants: { min: 0, max: 20 },
      },
    };
    const filter = buildUpworkFilter(criteria);
    expect(filter.proposalRange_eq).toEqual({ rangeEnd: 20 });
  });
});

describe("buildUpworkFilter — unrelated ranges still map independently", () => {
  it("keeps hourly rate and applicant range separate", () => {
    const criteria: FilterCriteria = {
      ...DEFAULT_FILTER_CRITERIA,
      job_terms: {
        ...DEFAULT_FILTER_CRITERIA.job_terms!,
        hourly_rate: { enabled: true, from: 20, to: 80 },
        applicants: { min: 0, max: 15 },
      },
    };
    const filter = buildUpworkFilter(criteria);
    expect(filter.hourlyRate_eq).toEqual({ rangeStart: 20, rangeEnd: 80 });
    expect(filter.proposalRange_eq).toEqual({ rangeEnd: 15 });
  });
});
