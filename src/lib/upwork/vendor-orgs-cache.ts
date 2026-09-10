/**
 * TTL and (de)serialization for the cached Upwork vendor organizations.
 *
 * A user's vendor-side orgs (their own freelancer profile and any Upwork
 * agencies they belong to) change very rarely, so the dashboard reads them from
 * `user_settings` instead of calling `companySelector` on every page load.
 *
 * These are Upwork's organizations, not this app's — there is no tenancy here.
 *
 * Upwork ToS forbids caching Upwork data beyond 24 hours, so the TTL below is a
 * hard ceiling, not a tuning knob. There is no manual refresh UI: the cache
 * refreshes on expiry, and is cleared outright whenever the Upwork connection
 * changes (disconnect, failed token refresh, reconnect, plan transition).
 *
 * This module is deliberately free of imports from the network and database
 * layers so it can be unit-tested in isolation, matching the convention in
 * `select-vendor-organizations.ts`.
 */

import type {
  UpworkVendorOrganization,
  UpworkVendorOrganizationKind,
} from "@/lib/upwork/select-vendor-organizations";

export const VENDOR_ORGS_CACHE_TTL_HOURS = 7;

const TTL_MS = VENDOR_ORGS_CACHE_TTL_HOURS * 3_600_000;

/**
 * Written into every payload that clears the Upwork tokens, so the cache can
 * never outlive the connection it describes. Spread this rather than repeating
 * the three keys, otherwise a new invalidation site can silently drift.
 */
export const VENDOR_ORGS_CACHE_CLEAR_PAYLOAD = Object.freeze({
  upwork_vendor_orgs: null,
  upwork_vendor_orgs_client_only: null,
  upwork_vendor_orgs_fetched_at: null,
});

/**
 * A missing, unparsable, or future timestamp is stale. Treating the future as
 * stale means clock skew can only cost one extra refresh; the alternative would
 * pin a cache open indefinitely.
 */
export function isVendorOrgsCacheFresh(
  fetchedAt: string | null | undefined,
  nowMs: number,
): boolean {
  if (!fetchedAt) return false;
  const parsed = Date.parse(fetchedAt);
  if (Number.isNaN(parsed)) return false;
  const age = nowMs - parsed;
  if (age < 0) return false;
  return age < TTL_MS;
}

const VALID_KINDS: readonly UpworkVendorOrganizationKind[] = [
  "personal",
  "agency",
  "unknown",
];

function isValidKind(value: unknown): value is UpworkVendorOrganizationKind {
  return (
    typeof value === "string" &&
    VALID_KINDS.includes(value as UpworkVendorOrganizationKind)
  );
}

/**
 * jsonb is untyped at the database boundary, so a hand-edited or legacy row must
 * degrade to a cache miss rather than crash a dashboard load.
 *
 * A single bad row rejects the whole array: serving a partial org list would
 * silently hide an agency from the picker, which is worse than one refetch.
 * Rows are rebuilt from known fields only, so nothing extra leaks through.
 */
export function parseCachedVendorOrgs(
  value: unknown,
): UpworkVendorOrganization[] | null {
  if (!Array.isArray(value)) return null;

  const organizations: UpworkVendorOrganization[] = [];

  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;

    const { organizationId, title, kind } = row as Record<string, unknown>;

    if (typeof organizationId !== "string" || organizationId.length === 0) {
      return null;
    }
    if (typeof title !== "string") return null;
    if (!isValidKind(kind)) return null;

    organizations.push({ organizationId, title, kind });
  }

  return organizations;
}
