import { describe, expect, it } from "vitest";
import {
  buildQualifySystemPrompt,
  buildQualifyUserPrompt,
} from "./build-qualify-prompt";
import { QUALIFY_JOB_DESCRIPTION_MAX_LENGTH } from "./constants";
import type { QualifyJobInput } from "./types";

const baseJob: QualifyJobInput = {
  id: "job-1",
  title: "Build a Next.js dashboard",
};

describe("buildQualifySystemPrompt", () => {
  it("interpolates the freelancer's criteria", () => {
    const prompt = buildQualifySystemPrompt("  Only React work.  ");
    expect(prompt).toContain("Only React work.");
    expect(prompt).toContain("FREELANCER'S CRITERIA");
  });

  it("keeps the silence-is-not-disqualification rule", () => {
    const prompt = buildQualifySystemPrompt("Only React work.");
    expect(prompt).toContain("Silence is not disqualification");
  });

  it("asks for unverifiable criteria to be reported", () => {
    const prompt = buildQualifySystemPrompt("Only React work.");
    expect(prompt).toContain('"unverifiable"');
    expect(prompt).toContain("honest and complete");
  });

  it("warns that no reviews is not a zero rating", () => {
    const prompt = buildQualifySystemPrompt("Only React work.");
    expect(prompt).toContain("does NOT mean a rating of zero");
  });
});

describe("buildQualifyUserPrompt", () => {
  it("omits fields the posting does not provide", () => {
    const prompt = buildQualifyUserPrompt(baseJob);
    expect(prompt).toContain("Title: Build a Next.js dashboard");
    expect(prompt).not.toContain("Experience level:");
    expect(prompt).not.toContain("Duration:");
    expect(prompt).not.toContain("Workload:");
    expect(prompt).not.toContain("Skills:");
    expect(prompt).not.toContain("Category:");
    expect(prompt).not.toContain("Posted:");
    expect(prompt).not.toContain("Applicants so far:");
    expect(prompt).not.toContain("Client country:");
    expect(prompt).not.toContain("Client total spend:");
    expect(prompt).not.toContain("Client payment verified:");
    expect(prompt).not.toContain("Client hires:");
    expect(prompt).not.toContain("Client rating:");
    expect(prompt).not.toContain("Description:");
  });

  it("includes job age, applicants and humanised categories", () => {
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      posted_age: "3 hours ago",
      total_applicants: 8,
      category: "web_mobile_software_dev",
      subcategory: "ecommerce_development",
    });
    expect(prompt).toContain("Posted: 3 hours ago");
    expect(prompt).toContain("Applicants so far: 8");
    expect(prompt).toContain(
      "Category: Web Mobile Software Dev / Ecommerce Development",
    );
  });

  it("renders zero applicants rather than omitting them", () => {
    // 0 proposals is a real, useful signal — not missing data.
    expect(
      buildQualifyUserPrompt({ ...baseJob, total_applicants: 0 }),
    ).toContain("Applicants so far: 0");
  });

  it("states payment verification either way", () => {
    expect(
      buildQualifyUserPrompt({ ...baseJob, client_payment_verified: true }),
    ).toContain("Client payment verified: yes");
    expect(
      buildQualifyUserPrompt({ ...baseJob, client_payment_verified: false }),
    ).toContain("Client payment verified: no");
  });

  it("combines hires and posted jobs into a hire-rate line", () => {
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      client_total_hires: 7,
      client_total_posted_jobs: 12,
    });
    expect(prompt).toContain("Client hires: 7 across 12 jobs posted");
  });

  it("handles a single posted job without mangling plurals", () => {
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      client_total_hires: 1,
      client_total_posted_jobs: 1,
    });
    expect(prompt).toContain("Client hires: 1 across 1 job posted");
  });

  it("renders each half of the hire-rate line alone", () => {
    expect(
      buildQualifyUserPrompt({ ...baseJob, client_total_hires: 3 }),
    ).toContain("Client hires: 3");
    expect(
      buildQualifyUserPrompt({ ...baseJob, client_total_posted_jobs: 9 }),
    ).toContain("Client jobs posted: 9");
  });

  it("describes an unrated client in words, never as a zero score", () => {
    // Upwork reports totalFeedback: 0 for a client who has never been rated.
    // Passing "0" through would read as an appalling client.
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      client_total_reviews: 0,
      client_avg_rating: 0,
    });
    expect(prompt).toContain("Client rating: no reviews yet");
    expect(prompt).not.toContain("0.0");
  });

  it("renders a real rating with its review count", () => {
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      client_total_reviews: 12,
      client_avg_rating: 4.2,
    });
    expect(prompt).toContain("Client rating: 4.2 out of 5 from 12 reviews");
  });

  it("rounds the rating to one decimal", () => {
    // 4.85 renders as "4.8": toFixed uses the binary double, which sits just
    // below 4.85, so it rounds down. Fine for display, worth pinning.
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      client_total_reviews: 12,
      client_avg_rating: 4.85,
    });
    expect(prompt).toContain("Client rating: 4.8 out of 5 from 12 reviews");
  });

  it("uses the singular for a lone review", () => {
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      client_total_reviews: 1,
      client_avg_rating: 5,
    });
    expect(prompt).toContain("Client rating: 5.0 out of 5 from 1 review");
  });

  it("reports reviews with no score separately", () => {
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      client_total_reviews: 3,
      client_avg_rating: null,
    });
    expect(prompt).toContain("Client reviews: 3 (no rating score available)");
  });

  it("renders an hourly range", () => {
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      hourly_rate_min: 40,
      hourly_rate_max: 60,
    });
    expect(prompt).toContain("Budget: $40-$60 per hour");
  });

  it("renders an open-ended hourly rate", () => {
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      hourly_rate_max: 75,
    });
    expect(prompt).toContain("Budget: $75 per hour");
  });

  it("renders a fixed budget with thousands separators", () => {
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      budget_min: 2000,
      budget_max: 2000,
    });
    expect(prompt).toContain("Budget: $2,000 fixed");
  });

  it("renders a fixed budget range", () => {
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      budget_min: 1000,
      budget_max: 5000,
    });
    expect(prompt).toContain("Budget: $1,000-$5,000 fixed");
  });

  it("prefers the hourly rate when both shapes are present", () => {
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      hourly_rate_min: 30,
      budget_min: 900,
      budget_max: 900,
    });
    expect(prompt).toContain("Budget: $30 per hour");
    expect(prompt).not.toContain("fixed");
  });

  it("says Not specified when the posting states no pay", () => {
    expect(buildQualifyUserPrompt(baseJob)).toContain("Budget: Not specified");
  });

  it("omits the skills line for an empty array", () => {
    const prompt = buildQualifyUserPrompt({ ...baseJob, skills: [] });
    expect(prompt).not.toContain("Skills:");
  });

  it("drops falsy entries from the skills list", () => {
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      skills: ["React", "", "TypeScript"],
    });
    expect(prompt).toContain("Skills: React, TypeScript");
  });

  it("includes a short description verbatim", () => {
    const prompt = buildQualifyUserPrompt({
      ...baseJob,
      description: "We need a dashboard.",
    });
    expect(prompt).toContain("We need a dashboard.");
    expect(prompt).not.toContain("[truncated]");
  });

  it("truncates a long description and marks it", () => {
    const long = "x".repeat(QUALIFY_JOB_DESCRIPTION_MAX_LENGTH + 500);
    const prompt = buildQualifyUserPrompt({ ...baseJob, description: long });
    expect(prompt).toContain("[truncated]");
    expect(prompt).toContain("x".repeat(50));
    // The body carried through is exactly the cap, not the full input.
    expect(prompt.length).toBeLessThan(long.length);
  });

  it("omits a whitespace-only description", () => {
    const prompt = buildQualifyUserPrompt({ ...baseJob, description: "   \n " });
    expect(prompt).not.toContain("Description:");
  });
});
