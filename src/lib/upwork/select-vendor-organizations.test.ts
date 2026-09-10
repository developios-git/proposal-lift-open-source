import { describe, expect, it } from "vitest";
import {
  pickDashboardVendorContext,
  selectVendorOrganizations,
} from "./select-vendor-organizations";

/**
 * Same fixture as select-agency-organizations.test.ts: the shape a real company
 * account returns. One personal vendor org, one client org, one agency vendor
 * org. The names and organization ids are placeholders.
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

describe("selectVendorOrganizations", () => {
  it("keeps both vendor orgs and drops the client org", () => {
    expect(selectVendorOrganizations(REAL_SELECTOR)).toEqual([
      {
        organizationId: "1000000000000000001",
        title: "Alex Rivera",
        kind: "personal",
      },
      {
        organizationId: "1000000000000000003",
        title: "Acme Agency",
        kind: "agency",
      },
    ]);
  });

  it("keeps a solo freelancer's own org, unlike the agency selector", () => {
    // This is the whole reason this module exists separately.
    const result = selectVendorOrganizations([
      {
        title: "Solo Dev",
        organizationId: "111",
        organizationType: "SoleProprietor",
        organizationLegacyType: "Vendor",
      },
    ]);
    expect(result).toEqual([
      { organizationId: "111", title: "Solo Dev", kind: "personal" },
    ]);
  });

  it("returns nothing for a client-only account", () => {
    expect(
      selectVendorOrganizations([
        {
          title: "Client Co",
          organizationId: "222",
          organizationType: "Business",
          organizationLegacyType: "Client",
        },
      ]),
    ).toEqual([]);
  });

  it("classifies an unrecognised organizationType as unknown", () => {
    const result = selectVendorOrganizations([
      {
        title: "Mystery",
        organizationId: "333",
        organizationLegacyType: "Vendor",
      },
    ]);
    expect(result).toEqual([
      { organizationId: "333", title: "Mystery", kind: "unknown" },
    ]);
  });

  it("matches type hints case-insensitively and ignores surrounding space", () => {
    const result = selectVendorOrganizations([
      {
        title: "Loose",
        organizationId: "444",
        organizationType: "  BUSINESS ",
        organizationLegacyType: " vendor ",
      },
    ]);
    expect(result).toEqual([
      { organizationId: "444", title: "Loose", kind: "agency" },
    ]);
  });

  it("coerces a numeric organizationId to a string", () => {
    const result = selectVendorOrganizations([
      {
        title: "Numeric",
        organizationId: 555 as unknown as string,
        organizationType: "SoleProprietor",
        organizationLegacyType: "Vendor",
      },
    ]);
    expect(result[0]?.organizationId).toBe("555");
  });

  it("falls back to a generic title when the org has none", () => {
    const result = selectVendorOrganizations([
      {
        title: "   ",
        organizationId: "666",
        organizationType: "SoleProprietor",
        organizationLegacyType: "Vendor",
      },
    ]);
    expect(result[0]?.title).toBe("Organization");
  });

  it("returns an empty list for no items", () => {
    expect(selectVendorOrganizations([])).toEqual([]);
  });
});

describe("pickDashboardVendorContext", () => {
  const ORGS = selectVendorOrganizations(REAL_SELECTOR);

  it("returns no tenant at all when there are no vendor orgs", () => {
    // Must NOT fall back to a client org. This is the bug being fixed.
    expect(pickDashboardVendorContext([], "1000000000000000002")).toEqual({});
    expect(pickDashboardVendorContext([], null)).toEqual({});
  });

  it("defaults to the first vendor org for an empty context", () => {
    expect(pickDashboardVendorContext(ORGS, null)).toEqual({
      tenantId: "1000000000000000001",
      organizationIdEq: "1000000000000000001",
    });
    expect(pickDashboardVendorContext(ORGS, "   ")).toEqual({
      tenantId: "1000000000000000001",
      organizationIdEq: "1000000000000000001",
    });
  });

  it("treats the legacy 'personal' value as the first vendor org", () => {
    expect(pickDashboardVendorContext(ORGS, "personal")).toEqual({
      tenantId: "1000000000000000001",
      organizationIdEq: "1000000000000000001",
    });
  });

  it("uses the matching vendor org when the context id is known", () => {
    expect(pickDashboardVendorContext(ORGS, "1000000000000000003")).toEqual({
      tenantId: "1000000000000000003",
      organizationIdEq: "1000000000000000003",
    });
  });

  it("falls back to the first vendor org when the context id is a client org", () => {
    // A stale localStorage value from before this change.
    expect(pickDashboardVendorContext(ORGS, "1000000000000000002")).toEqual({
      tenantId: "1000000000000000001",
      organizationIdEq: "1000000000000000001",
    });
  });

  it("uses the only vendor org when the account has exactly one", () => {
    const solo = selectVendorOrganizations([REAL_SELECTOR[0]]);
    expect(pickDashboardVendorContext(solo, null)).toEqual({
      tenantId: "1000000000000000001",
      organizationIdEq: "1000000000000000001",
    });
  });
});
