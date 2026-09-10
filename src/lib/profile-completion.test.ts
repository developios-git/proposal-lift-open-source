import { describe, expect, it } from "vitest";
import {
  computeProfileCompletion,
  MIN_PROFILE_COMPLETION_FOR_PROPOSALS,
  type ProfileForCompletion,
} from "./profile-completion";

const EMPTY: ProfileForCompletion = {};

describe("computeProfileCompletion", () => {
  it("scores an empty or null profile at 0", () => {
    expect(computeProfileCompletion(null)).toBe(0);
    expect(computeProfileCompletion(EMPTY)).toBe(0);
  });

  it("scores a fully filled profile at 100", () => {
    expect(
      computeProfileCompletion({
        full_name: "Ayesha K.",
        role_title: "Engineer",
        location: "Lahore, Pakistan",
        bio: "I build things.",
        skills: ["React"],
        specializations: ["Fintech"],
        years_of_experience: 7,
        certifications: ["AWS"],
        upwork_url: "https://upwork.com/freelancers/x",
        linkedin_url: "https://linkedin.com/in/x",
        website_url: "https://example.com",
        github_url: "https://github.com/x",
      }),
    ).toBe(100);
  });

  describe("socialLinks awards its 25 points for ANY single link", () => {
    // Regression guard: this section used to require all four links, which
    // made 25 points unreachable for Upwork imports (Upwork supplies only the
    // Upwork URL) and stranded otherwise-complete profiles below the threshold.
    it.each([
      ["upwork_url", { upwork_url: "https://upwork.com/freelancers/x" }],
      ["linkedin_url", { linkedin_url: "https://linkedin.com/in/x" }],
      ["website_url", { website_url: "https://example.com" }],
      ["github_url", { github_url: "https://github.com/x" }],
    ])("awards 25 for %s alone", (_label, profile) => {
      expect(computeProfileCompletion(profile as ProfileForCompletion)).toBe(25);
    });

    it("does not double count when several links are present", () => {
      expect(
        computeProfileCompletion({
          upwork_url: "https://upwork.com/freelancers/x",
          linkedin_url: "https://linkedin.com/in/x",
          website_url: "https://example.com",
        }),
      ).toBe(25);
    });

    it("awards nothing when every link is empty or null", () => {
      expect(
        computeProfileCompletion({
          upwork_url: "",
          linkedin_url: null,
          website_url: undefined,
          github_url: "",
        }),
      ).toBe(0);
    });
  });

  describe("individual section weights", () => {
    it("awards 15 for any one identity field", () => {
      expect(computeProfileCompletion({ full_name: "A" })).toBe(15);
      expect(computeProfileCompletion({ role_title: "Dev" })).toBe(15);
      expect(computeProfileCompletion({ location: "Lahore" })).toBe(15);
    });

    it("awards 25 for a bio", () => {
      expect(computeProfileCompletion({ bio: "Hello" })).toBe(25);
    });

    it("awards 15 for at least one skill and nothing for an empty array", () => {
      expect(computeProfileCompletion({ skills: ["React"] })).toBe(15);
      expect(computeProfileCompletion({ skills: [] })).toBe(0);
    });

    it("awards 10 for at least one specialization", () => {
      expect(computeProfileCompletion({ specializations: ["Fintech"] })).toBe(10);
      expect(computeProfileCompletion({ specializations: [] })).toBe(0);
    });

    it("awards 10 for experience from either years or certifications", () => {
      expect(computeProfileCompletion({ years_of_experience: 3 })).toBe(10);
      expect(computeProfileCompletion({ years_of_experience: 0 })).toBe(10);
      expect(computeProfileCompletion({ certifications: ["AWS"] })).toBe(10);
      expect(computeProfileCompletion({ certifications: [""] })).toBe(0);
      expect(computeProfileCompletion({ years_of_experience: "" })).toBe(0);
    });
  });

  describe("Upwork import shapes clear the proposal threshold", () => {
    // What an imported agency member actually looks like: identity, bio,
    // skills, experience, and the Upwork URL, with no specializations.
    const importedWithoutSpecializations: ProfileForCompletion = {
      full_name: "Alex R.",
      role_title: "AI-Native Engineer",
      location: "Lisbon, Portugal",
      bio: "I build production-grade web apps.",
      skills: ["React", "Next.js"],
      specializations: [],
      years_of_experience: 7,
      upwork_url: "https://upwork.com/freelancers/alexrivera",
    };

    it("scores 90 without specializations", () => {
      expect(computeProfileCompletion(importedWithoutSpecializations)).toBe(90);
    });

    it("scores 100 with specializations", () => {
      expect(
        computeProfileCompletion({
          ...importedWithoutSpecializations,
          specializations: ["eCommerce"],
        }),
      ).toBe(100);
    });

    it("is selectable for proposals in both cases", () => {
      expect(
        computeProfileCompletion(importedWithoutSpecializations),
      ).toBeGreaterThanOrEqual(MIN_PROFILE_COMPLETION_FOR_PROPOSALS);
    });
  });
});
