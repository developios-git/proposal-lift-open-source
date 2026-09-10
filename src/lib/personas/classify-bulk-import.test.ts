import { describe, expect, it } from "vitest";
import type { UpworkPersonaDraft } from "./map-upwork-member-to-persona";
import { classifyDraftForBulkImport } from "./classify-bulk-import";

/** A draft shaped like a real enriched agency member. */
const READY: UpworkPersonaDraft = {
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
};

const NONE: ReadonlySet<string> = new Set();

describe("classifyDraftForBulkImport", () => {
  it("marks a complete, unseen draft as ready and returns validated values", () => {
    const result = classifyDraftForBulkImport(READY, NONE);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.values.full_name).toBe("Ayesha K.");
    expect(result.values.upwork_person_id).toBe("1181921839933591552");
    expect(result.values.skills).toEqual(["React", "TypeScript"]);
  });

  it("marks an already-imported person as duplicate", () => {
    const result = classifyDraftForBulkImport(
      READY,
      new Set(["1181921839933591552"]),
    );
    expect(result).toEqual({ status: "duplicate" });
  });

  it("checks the duplicate set before validating, so a duplicate never reports as incomplete", () => {
    const result = classifyDraftForBulkImport(
      { ...READY, bio: null, skills: [] },
      new Set(["1181921839933591552"]),
    );
    expect(result).toEqual({ status: "duplicate" });
  });

  it("reports a draft with no talent profile as incomplete, naming each gap", () => {
    // What an unenriched member looks like: name and photo only.
    const result = classifyDraftForBulkImport(
      {
        ...READY,
        role_title: null,
        bio: null,
        skills: [],
        specializations: [],
        years_of_experience: null,
      },
      NONE,
    );
    expect(result.status).toBe("incomplete");
    if (result.status !== "incomplete") throw new Error("expected incomplete");
    expect(result.missing).toEqual(
      expect.arrayContaining(["a role", "a bio", "skills"]),
    );
  });

  it.each([
    ["a name", { full_name: null }],
    ["a role", { role_title: null }],
    ["a bio", { bio: null }],
    ["skills", { skills: [] }],
  ])("reports %s as missing on its own", (label, patch) => {
    const result = classifyDraftForBulkImport(
      { ...READY, ...patch } as UpworkPersonaDraft,
      NONE,
    );
    expect(result.status).toBe("incomplete");
    if (result.status !== "incomplete") throw new Error("expected incomplete");
    expect(result.missing).toEqual([label]);
  });

  it("does not require specializations, experience, location, or an avatar", () => {
    const result = classifyDraftForBulkImport(
      {
        ...READY,
        specializations: [],
        years_of_experience: null,
        location: null,
        timezone: null,
        avatar_url: null,
      },
      NONE,
    );
    expect(result.status).toBe("ready");
  });

  it("reports an over-long role title, which the schema caps at 100", () => {
    const result = classifyDraftForBulkImport(
      { ...READY, role_title: "x".repeat(101) },
      NONE,
    );
    expect(result.status).toBe("incomplete");
    if (result.status !== "incomplete") throw new Error("expected incomplete");
    expect(result.missing).toEqual(["a role"]);
  });

  it("reports a malformed URL rather than silently dropping the person", () => {
    const result = classifyDraftForBulkImport(
      { ...READY, upwork_url: "not-a-url" },
      NONE,
    );
    expect(result.status).toBe("incomplete");
    if (result.status !== "incomplete") throw new Error("expected incomplete");
    expect(result.missing).toEqual(["a valid Upwork link"]);
  });

  it("dedupes the missing list when one field raises several issues", () => {
    const result = classifyDraftForBulkImport(
      { ...READY, full_name: null, role_title: null },
      NONE,
    );
    expect(result.status).toBe("incomplete");
    if (result.status !== "incomplete") throw new Error("expected incomplete");
    expect(result.missing).toEqual(["a name", "a role"]);
    expect(new Set(result.missing).size).toBe(result.missing.length);
  });
});
