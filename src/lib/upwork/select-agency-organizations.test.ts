import { describe, expect, it } from "vitest";
import { selectAgencyOrganizations } from "./select-agency-organizations";

/**
 * The three-org fixture is the shape a real company account returns, captured
 * during the agency-member spike. The names are placeholders, and the
 * organization ids below are in the 19-digit form Upwork returns rather than
 * real ones.
 */
const REAL_SELECTOR = [
  {
    title: "Alex Rivera",
    organizationId: "1000000000000000001",
    organizationType: "SoleProprietor",
    organizationLegacyType: "Vendor",
  },
  {
    title: "Acme Agency",
    organizationId: "1000000000000000002",
    organizationType: "Business",
    organizationLegacyType: "Client",
  },
  {
    title: "Acme Agency",
    organizationId: "1000000000000000003",
    organizationType: "Business",
    organizationLegacyType: "Vendor",
  },
];

describe("selectAgencyOrganizations", () => {
  it("picks only the Business + Vendor org from a real company selector", () => {
    expect(selectAgencyOrganizations(REAL_SELECTOR)).toEqual([
      { organizationId: "1000000000000000003", title: "Acme Agency" },
    ]);
  });

  it("rejects a SoleProprietor org even though it is also Vendor", () => {
    // A freelancer's own account. Vendor alone must never qualify.
    const result = selectAgencyOrganizations([
      {
        title: "Alex Rivera",
        organizationId: "111",
        organizationType: "SoleProprietor",
        organizationLegacyType: "Vendor",
      },
    ]);
    expect(result).toEqual([]);
  });

  it("rejects a Business org that is Client", () => {
    const result = selectAgencyOrganizations([
      {
        title: "Client Co",
        organizationId: "222",
        organizationType: "Business",
        organizationLegacyType: "Client",
      },
    ]);
    expect(result).toEqual([]);
  });

  it("rejects an org missing either hint", () => {
    expect(
      selectAgencyOrganizations([
        {
          title: "No type",
          organizationId: "333",
          organizationLegacyType: "Vendor",
        },
      ]),
    ).toEqual([]);
    expect(
      selectAgencyOrganizations([
        {
          title: "No legacy",
          organizationId: "444",
          organizationType: "Business",
        },
      ]),
    ).toEqual([]);
  });

  it("matches type hints case-insensitively and ignores surrounding space", () => {
    const result = selectAgencyOrganizations([
      {
        title: "Loose",
        organizationId: "555",
        organizationType: "  business ",
        organizationLegacyType: "VENDOR",
      },
    ]);
    expect(result).toEqual([{ organizationId: "555", title: "Loose" }]);
  });

  it("coerces a numeric organizationId to a string", () => {
    const result = selectAgencyOrganizations([
      {
        title: "Numeric",
        organizationId: 666 as unknown as string,
        organizationType: "Business",
        organizationLegacyType: "Vendor",
      },
    ]);
    expect(result[0]?.organizationId).toBe("666");
  });

  it("falls back to a generic title when the org has none", () => {
    const result = selectAgencyOrganizations([
      {
        title: "   ",
        organizationId: "777",
        organizationType: "Business",
        organizationLegacyType: "Vendor",
      },
    ]);
    expect(result).toEqual([{ organizationId: "777", title: "Agency" }]);
  });

  it("returns an empty list for no items", () => {
    expect(selectAgencyOrganizations([])).toEqual([]);
  });
});
