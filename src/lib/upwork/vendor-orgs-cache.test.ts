import { describe, expect, it } from "vitest";
import {
  isVendorOrgsCacheFresh,
  parseCachedVendorOrgs,
  VENDOR_ORGS_CACHE_CLEAR_PAYLOAD,
  VENDOR_ORGS_CACHE_TTL_HOURS,
} from "./vendor-orgs-cache";

const NOW = Date.parse("2026-07-31T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("isVendorOrgsCacheFresh", () => {
  it("uses a 7 hour TTL", () => {
    expect(VENDOR_ORGS_CACHE_TTL_HOURS).toBe(7);
  });

  it("is fresh inside the window and stale at or past it", () => {
    expect(isVendorOrgsCacheFresh(hoursAgo(0), NOW)).toBe(true);
    expect(isVendorOrgsCacheFresh(hoursAgo(6.9), NOW)).toBe(true);
    expect(isVendorOrgsCacheFresh(hoursAgo(7), NOW)).toBe(false);
    expect(isVendorOrgsCacheFresh(hoursAgo(24), NOW)).toBe(false);
  });

  it("treats missing or unparsable timestamps as stale", () => {
    expect(isVendorOrgsCacheFresh(null, NOW)).toBe(false);
    expect(isVendorOrgsCacheFresh(undefined, NOW)).toBe(false);
    expect(isVendorOrgsCacheFresh("not-a-date", NOW)).toBe(false);
    expect(isVendorOrgsCacheFresh("   ", NOW)).toBe(false);
  });

  it("treats a future timestamp as stale rather than trusting clock skew", () => {
    expect(
      isVendorOrgsCacheFresh(new Date(NOW + 3_600_000).toISOString(), NOW),
    ).toBe(false);
  });
});

describe("parseCachedVendorOrgs", () => {
  const valid = [
    { organizationId: "123", title: "Alex Rivera", kind: "personal" },
    { organizationId: "456", title: "Acme Agency", kind: "agency" },
  ];

  it("accepts a well-formed array", () => {
    expect(parseCachedVendorOrgs(valid)).toEqual(valid);
  });

  it("accepts an empty array, which means a client-only account", () => {
    expect(parseCachedVendorOrgs([])).toEqual([]);
  });

  it("accepts the unknown kind, which is a legitimate value", () => {
    expect(
      parseCachedVendorOrgs([
        { organizationId: "1", title: "x", kind: "unknown" },
      ]),
    ).toEqual([{ organizationId: "1", title: "x", kind: "unknown" }]);
  });

  it("rejects anything that is not an array of complete rows", () => {
    expect(parseCachedVendorOrgs(null)).toBeNull();
    expect(parseCachedVendorOrgs(undefined)).toBeNull();
    expect(parseCachedVendorOrgs("[]")).toBeNull();
    expect(parseCachedVendorOrgs({ organizationId: "1" })).toBeNull();
    expect(
      parseCachedVendorOrgs([{ organizationId: "1", title: "x" }]),
    ).toBeNull();
    expect(
      parseCachedVendorOrgs([{ organizationId: 1, title: "x", kind: "agency" }]),
    ).toBeNull();
    expect(
      parseCachedVendorOrgs([{ organizationId: "1", title: "x", kind: "boss" }]),
    ).toBeNull();
  });

  it("rejects the whole array when a single row is bad", () => {
    expect(
      parseCachedVendorOrgs([
        { organizationId: "1", title: "good", kind: "agency" },
        { organizationId: "2", title: "bad" },
      ]),
    ).toBeNull();
  });

  it("drops unknown extra fields instead of passing them through", () => {
    expect(
      parseCachedVendorOrgs([
        { organizationId: "1", title: "x", kind: "agency", secret: "nope" },
      ]),
    ).toEqual([{ organizationId: "1", title: "x", kind: "agency" }]);
  });
});

describe("VENDOR_ORGS_CACHE_CLEAR_PAYLOAD", () => {
  it("nulls all three columns", () => {
    expect(VENDOR_ORGS_CACHE_CLEAR_PAYLOAD).toEqual({
      upwork_vendor_orgs: null,
      upwork_vendor_orgs_client_only: null,
      upwork_vendor_orgs_fetched_at: null,
    });
  });
});
