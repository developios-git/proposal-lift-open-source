import { describe, expect, it } from "vitest";
import type {
  UpworkAgencyStaffMember,
  UpworkTalentProfile,
} from "@/lib/upwork/agency-member-types";
import {
  deriveYearsOfExperience,
  mapUpworkMemberToPersonaDraft,
} from "./map-upwork-member-to-persona";

const NOW = new Date("2026-07-30T00:00:00.000Z");

/**
 * Shapes match what the real API returned during the agency-member spike:
 * StaffUser name fields are null (scope-blocked), the talent profile's
 * lastName is an initial, and timezone is a display string, not IANA.
 */
const member: UpworkAgencyStaffMember = {
  personId: "1181921839933591552",
  firstName: null,
  lastName: null,
  name: "Ayesha K.",
  photoUrl: "https://cdn.upwork.com/staff-photo.jpg",
  publicUrl: "https://www.upwork.com/freelancers/~staffcipher",
  email: null,
  activationStatus: 1,
};

const profile: UpworkTalentProfile = {
  personId: "1181921839933591552",
  firstName: "Ayesha",
  lastName: "K.",
  title: "Senior React Developer",
  description: "I build dashboards for fintech teams.",
  portraitUrl: "https://cdn.upwork.com/portrait-500.jpg",
  profileUrl: "https://www.upwork.com/freelancers/~profilecipher",
  country: "Pakistan",
  city: "Lahore",
  timezone: "UTC+05:00 Islamabad, Karachi",
  skills: ["React", "TypeScript"],
  specializations: ["Fintech"],
  employmentStartDates: ["2019-03-01", "2021-06-01"],
};

describe("mapUpworkMemberToPersonaDraft", () => {
  it("prefers talent profile data over the staff row", () => {
    const draft = mapUpworkMemberToPersonaDraft(member, profile, NOW);
    expect(draft).toEqual({
      full_name: "Ayesha K.",
      role_title: "Senior React Developer",
      bio: "I build dashboards for fintech teams.",
      avatar_url: "https://cdn.upwork.com/portrait-500.jpg",
      location: "Lahore, Pakistan",
      timezone: "UTC+05:00 Islamabad, Karachi",
      years_of_experience: 7,
      skills: ["React", "TypeScript"],
      specializations: ["Fintech"],
      certifications: [],
      upwork_url: "https://www.upwork.com/freelancers/~profilecipher",
      upwork_person_id: "1181921839933591552",
    });
  });

  it("falls back to staff-row fields when there is no talent profile", () => {
    // The degraded path: enrichment unavailable, so only name, photo, and
    // profile link survive and the user fills the rest in the form.
    const draft = mapUpworkMemberToPersonaDraft(member, null, NOW);
    expect(draft.full_name).toBe("Ayesha K.");
    expect(draft.avatar_url).toBe("https://cdn.upwork.com/staff-photo.jpg");
    expect(draft.upwork_url).toBe(
      "https://www.upwork.com/freelancers/~staffcipher",
    );
    expect(draft.role_title).toBeNull();
    expect(draft.bio).toBeNull();
    expect(draft.location).toBeNull();
    expect(draft.timezone).toBeNull();
    expect(draft.years_of_experience).toBeNull();
    expect(draft.skills).toEqual([]);
    expect(draft.specializations).toEqual([]);
  });

  it("prefers staff first and last name if a future scope grant supplies them", () => {
    const draft = mapUpworkMemberToPersonaDraft(
      { ...member, firstName: "Ayesha", lastName: "Khan" },
      null,
      NOW,
    );
    expect(draft.full_name).toBe("Ayesha Khan");
  });

  it("normalizes the doubled spaces Upwork puts in StaffUser.name", () => {
    const draft = mapUpworkMemberToPersonaDraft(
      { ...member, name: "Hira  Zulfiqar" },
      null,
      NOW,
    );
    expect(draft.full_name).toBe("Hira Zulfiqar");
  });

  it("returns a null name when the staff row has no name at all", () => {
    const draft = mapUpworkMemberToPersonaDraft(
      { ...member, firstName: null, lastName: null, name: null },
      null,
      NOW,
    );
    expect(draft.full_name).toBeNull();
  });

  it("builds the location from whichever part is present", () => {
    expect(
      mapUpworkMemberToPersonaDraft(member, { ...profile, city: null }, NOW)
        .location,
    ).toBe("Pakistan");
    expect(
      mapUpworkMemberToPersonaDraft(member, { ...profile, country: null }, NOW)
        .location,
    ).toBe("Lahore");
    expect(
      mapUpworkMemberToPersonaDraft(
        member,
        { ...profile, city: null, country: null },
        NOW,
      ).location,
    ).toBeNull();
  });

  it("dedupes skills case-insensitively and keeps the first casing", () => {
    const draft = mapUpworkMemberToPersonaDraft(
      member,
      { ...profile, skills: ["React", "react", " REACT ", "Node"] },
      NOW,
    );
    expect(draft.skills).toEqual(["React", "Node"]);
  });

  it("drops blank skills and specializations", () => {
    const draft = mapUpworkMemberToPersonaDraft(
      member,
      { ...profile, skills: ["", "  ", "Vue"], specializations: ["  "] },
      NOW,
    );
    expect(draft.skills).toEqual(["Vue"]);
    expect(draft.specializations).toEqual([]);
  });

  it("caps skills at 50 so the persona schema max of 100 is never hit", () => {
    const many = Array.from({ length: 80 }, (_, i) => `Skill ${i}`);
    const draft = mapUpworkMemberToPersonaDraft(
      member,
      { ...profile, skills: many },
      NOW,
    );
    expect(draft.skills).toHaveLength(50);
  });

  it("never emits certifications, since Upwork only exposes community certificates", () => {
    expect(
      mapUpworkMemberToPersonaDraft(member, profile, NOW).certifications,
    ).toEqual([]);
  });
});

describe("deriveYearsOfExperience", () => {
  it("counts whole years from the earliest start date", () => {
    expect(deriveYearsOfExperience(["2019-03-01", "2021-06-01"], NOW)).toBe(7);
  });

  it("rounds down on an exact anniversary, because a year is averaged at 365.25 days", () => {
    // 2016-07-30 to 2026-07-30 is 3652 real days, just under 10 * 365.25.
    // Pinned deliberately: this is the cost of not doing calendar math, and it
    // only ever understates experience by one year on the boundary.
    expect(deriveYearsOfExperience(["2016-07-30T00:00:00Z"], NOW)).toBe(9);
  });

  it("returns null with no dates", () => {
    expect(deriveYearsOfExperience([], NOW)).toBeNull();
  });

  it("ignores unparseable dates", () => {
    expect(deriveYearsOfExperience(["not a date"], NOW)).toBeNull();
    expect(
      deriveYearsOfExperience(["not a date", "2016-01-01T00:00:00Z"], NOW),
    ).toBe(10);
  });

  it("ignores future dates", () => {
    expect(deriveYearsOfExperience(["2030-01-01T00:00:00Z"], NOW)).toBeNull();
  });

  it("returns 0 for a start date less than a year ago", () => {
    expect(deriveYearsOfExperience(["2026-01-01T00:00:00Z"], NOW)).toBe(0);
  });

  it("clamps to the schema maximum of 100", () => {
    expect(deriveYearsOfExperience(["1850-01-01T00:00:00Z"], NOW)).toBe(100);
  });
});
