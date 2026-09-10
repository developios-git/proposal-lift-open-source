import { describe, expect, it } from "vitest";
import type { UpworkJob } from "@/lib/upwork/client";
import { DEFAULT_FILTER_CRITERIA } from "@/types";
import type { FilterCriteria } from "@/types";
import {
  DEFAULT_EXCLUDE_SEARCH_IN,
  filterUpworkJobsByExcludeTerms,
  normalizeExcludeTerms,
  resolveExcludeSearchIn,
  upworkJobMatchesAnyExcludeTerm,
} from "./filter-jobs-by-exclude-keywords";

function makeJob(partial: Partial<UpworkJob>): UpworkJob {
  return {
    id: "1",
    ciphertext: null,
    title: "",
    description: "",
    createdDateTime: new Date().toISOString(),
    duration: null,
    durationLabel: null,
    engagement: null,
    amount: null,
    skills: [],
    experienceLevel: null,
    category: null,
    subcategory: null,
    totalApplicants: null,
    renewedDateTime: null,
    preferredFreelancerLocation: null,
    preferredFreelancerLocationMandatory: null,
    applied: null,
    client: null,
    ...partial,
  };
}

const criteriaWithExclude = (
  exclude_terms: string[],
  exclude_search_in?: string[],
): FilterCriteria =>
  ({
    keywords: {
      terms: ["react"],
      search_in: ["title", "description", "skills"],
      exclude: false,
      highlight: true,
      exclude_terms,
      ...(exclude_search_in !== undefined
        ? { exclude_search_in }
        : {}),
    },
  }) as FilterCriteria;

describe("normalizeExcludeTerms", () => {
  it("returns empty for non-arrays", () => {
    expect(normalizeExcludeTerms(undefined)).toEqual([]);
    expect(normalizeExcludeTerms(null)).toEqual([]);
  });

  it("trims and drops empty strings", () => {
    expect(
      normalizeExcludeTerms(["  Shopify ", "", "  wordpress"]),
    ).toEqual(["Shopify", "wordpress"]);
  });
});

describe("resolveExcludeSearchIn", () => {
  it("defaults to all surfaces when key missing (legacy filters)", () => {
    expect(resolveExcludeSearchIn(undefined)).toEqual(
      DEFAULT_EXCLUDE_SEARCH_IN,
    );
    expect(
      resolveExcludeSearchIn({
        keywords: { exclude_terms: ["x"] },
      } as FilterCriteria),
    ).toEqual(DEFAULT_EXCLUDE_SEARCH_IN);
  });

  it("returns null when user cleared all checkboxes (explicit empty array)", () => {
    expect(
      resolveExcludeSearchIn({
        ...DEFAULT_FILTER_CRITERIA,
        keywords: {
          ...DEFAULT_FILTER_CRITERIA.keywords!,
          exclude_terms: ["shopify"],
          exclude_search_in: [],
        },
      } satisfies FilterCriteria),
    ).toBe(null);
  });

  it("filters to allowed keys only", () => {
    expect(
      resolveExcludeSearchIn({
        ...DEFAULT_FILTER_CRITERIA,
        keywords: {
          ...DEFAULT_FILTER_CRITERIA.keywords!,
          exclude_search_in: ["title", "skills", "invalid"],
        },
      } satisfies FilterCriteria),
    ).toEqual(["title", "skills"]);
  });
});

describe("upworkJobMatchesAnyExcludeTerm", () => {
  const all = DEFAULT_EXCLUDE_SEARCH_IN;

  it("matches title", () => {
    const job = makeJob({ title: "React dev for Shopify store" });
    expect(upworkJobMatchesAnyExcludeTerm(job, ["shopify"], all)).toBe(true);
  });

  it("matches description", () => {
    const job = makeJob({
      title: "Developer",
      description: "Need WordPress expert",
    });
    expect(upworkJobMatchesAnyExcludeTerm(job, ["wordpress"], all)).toBe(true);
  });

  it("matches skills", () => {
    const job = makeJob({
      skills: [{ name: "wordpress", prettyName: "WordPress" }],
    });
    expect(upworkJobMatchesAnyExcludeTerm(job, ["wordpress"], all)).toBe(true);
  });

  it("is case-insensitive when all surfaces", () => {
    const job = makeJob({ title: "SHOPIFY integration" });
    expect(upworkJobMatchesAnyExcludeTerm(job, ["shopify"], all)).toBe(true);
  });

  it("title only: matches when term in title", () => {
    const job = makeJob({
      title: "Shopify store",
      description: "nothing",
    });
    expect(
      upworkJobMatchesAnyExcludeTerm(job, ["shopify"], ["title"]),
    ).toBe(true);
  });

  it("title only: no match when term only in description", () => {
    const job = makeJob({
      title: "React developer needed",
      description: "Shopify integration",
    });
    expect(
      upworkJobMatchesAnyExcludeTerm(job, ["shopify"], ["title"]),
    ).toBe(false);
  });

  it("skills only: matches when term in skill, not title", () => {
    const job = makeJob({
      title: "React developer needed",
      description: "",
      skills: [{ name: "shopify", prettyName: "Shopify" }],
    });
    expect(
      upworkJobMatchesAnyExcludeTerm(job, ["shopify"], ["skills"]),
    ).toBe(true);
  });

  it("skills only: no match when term only in title", () => {
    const job = makeJob({
      title: "Shopify developer needed",
      skills: [{ name: "react", prettyName: "React" }],
    });
    expect(
      upworkJobMatchesAnyExcludeTerm(job, ["shopify"], ["skills"]),
    ).toBe(false);
  });

  it("returns false when no surfaces enabled", () => {
    expect(
      upworkJobMatchesAnyExcludeTerm(makeJob({ title: "Shopify" }), [], []),
    ).toBe(false);
  });

  it("returns false when no term matches", () => {
    const job = makeJob({ title: "React and Node" });
    expect(
      upworkJobMatchesAnyExcludeTerm(job, ["wordpress", "shopify"], all),
    ).toBe(false);
  });
});

describe("filterUpworkJobsByExcludeTerms", () => {
  it("returns all jobs when no exclude_terms on criteria", () => {
    const jobs = [
      makeJob({ id: "a", title: "Shopify" }),
      makeJob({ id: "b", title: "React" }),
    ];
    expect(
      filterUpworkJobsByExcludeTerms(jobs, {
        keywords: {
          terms: [],
          exclude_terms: [],
          search_in: ["title"],
          exclude: false,
          highlight: true,
        },
      }),
    ).toEqual(jobs);
  });

  it("removes jobs matching any exclude term (default surfaces)", () => {
    const jobs = [
      makeJob({ id: "1", title: "React Developer for Shopify" }),
      makeJob({ id: "2", title: "React only" }),
    ];
    const out = filterUpworkJobsByExcludeTerms(
      jobs,
      criteriaWithExclude(["shopify"]),
    );
    expect(out.map((j) => j.id)).toEqual(["2"]);
  });

  it("honors title-only: keeps job when Shopify only in description", () => {
    const jobs = [
      makeJob({
        id: "1",
        title: "React developer for store",
        description: "Shopify experience preferred",
      }),
    ];
    const out = filterUpworkJobsByExcludeTerms(
      jobs,
      criteriaWithExclude(["shopify"], ["title"]),
    );
    expect(out.map((j) => j.id)).toEqual(["1"]);
  });

  it("does not filter when exclude_search_in empty (user disabled surfaces)", () => {
    const jobs = [
      makeJob({ id: "1", title: "Shopify only" }),
    ];
    const out = filterUpworkJobsByExcludeTerms(
      jobs,
      criteriaWithExclude(["shopify"], []),
    );
    expect(out).toEqual(jobs);
  });
});
