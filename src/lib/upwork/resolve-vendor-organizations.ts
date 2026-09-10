/**
 * Single entry point for "which Upwork orgs can this tenant send proposals from".
 *
 * Reads the 7-hour cache on the tenant's settings row and only calls Upwork's
 * `companySelector` on a miss. Before this existed the dashboard called that
 * query twice per page load: once in /api/dashboard/upwork-contexts and again
 * inside the activity routes just to validate the `context` query param.
 */

import type { ProposalTenant } from "@/lib/extension/membership";
import { fetchUpworkCompanySelector } from "@/lib/upwork/client";
import type { UpworkQuotaContext } from "@/lib/upwork/quota";
import {
  selectVendorOrganizations,
  type UpworkVendorOrganization,
} from "@/lib/upwork/select-vendor-organizations";
import {
  fetchTenantUpworkSettingsRow,
  updateTenantVendorOrgsCache,
} from "@/lib/upwork/tenant-upwork-settings";
import {
  isVendorOrgsCacheFresh,
  parseCachedVendorOrgs,
  VENDOR_ORGS_CACHE_TTL_HOURS,
} from "@/lib/upwork/vendor-orgs-cache";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;

export interface ResolvedVendorOrganizations {
  organizations: UpworkVendorOrganization[];
  /** Token works, but the Upwork account has no freelancer or agency profile. */
  clientOnly: boolean;
  source: "cache" | "upwork";
}

type CacheMissReason = "no_cache" | "expired" | "malformed";

const LOG_PREFIX = "[upwork vendorOrgs]";

/**
 * Always logged, not gated behind a debug env var, so it is verifiable in any
 * environment which path ran and whether an Upwork call was spent.
 */
function logSource(
  source: "CACHE" | "UPWORK",
  detail: Record<string, unknown>,
) {
  console.log(`${LOG_PREFIX} source=${source}`, detail);
}

/**
 * @param settingsRow Pass the row the caller already loaded for its tokens. The
 * cache columns live on that same row, so supplying it makes the cache hit path
 * cost zero extra database round-trips.
 */
export async function resolveVendorOrganizations(
  serviceClient: Db,
  tenant: ProposalTenant,
  accessToken: string,
  options: {
    quotaContext?: UpworkQuotaContext;
    settingsRow?: Record<string, unknown>;
  } = {},
): Promise<ResolvedVendorOrganizations> {
  let row = options.settingsRow;

  if (!row) {
    const { data } = await fetchTenantUpworkSettingsRow(serviceClient, tenant);
    row = (data as Record<string, unknown> | null) ?? undefined;
  }

  const fetchedAt = (row?.upwork_vendor_orgs_fetched_at ?? null) as
    | string
    | null;
  const now = Date.now();

  let missReason: CacheMissReason = "no_cache";

  if (fetchedAt) {
    if (!isVendorOrgsCacheFresh(fetchedAt, now)) {
      missReason = "expired";
    } else {
      const cached = parseCachedVendorOrgs(row?.upwork_vendor_orgs);
      if (cached) {
        logSource("CACHE", {
          upworkApiCalls: 0,
          organizations: cached.length,
          ageMinutes: Math.round((now - Date.parse(fetchedAt)) / 60_000),
          note: "served from DB, companySelector was NOT called",
        });

        return {
          organizations: cached,
          clientOnly: row?.upwork_vendor_orgs_client_only === true,
          source: "cache",
        };
      }
      missReason = "malformed";
    }
  }

  const selectorItems = await fetchUpworkCompanySelector(
    accessToken,
    options.quotaContext ? { quotaContext: options.quotaContext } : undefined,
  );
  const organizations = selectVendorOrganizations(selectorItems);
  // The account authenticated fine but can only act as a client, so it has no
  // vendor proposals to chart. Distinct from `skipped` (no Upwork token).
  const clientOnly = organizations.length === 0 && selectorItems.length > 0;

  try {
    await updateTenantVendorOrgsCache(serviceClient, tenant, {
      organizations,
      clientOnly,
      fetchedAt: new Date(now).toISOString(),
    });
  } catch (e) {
    // A cache write failure costs one extra call next load. It must never fail
    // the request that already has the data it needs.
    console.warn(`${LOG_PREFIX} failed to write cache:`, e);
  }

  logSource("UPWORK", {
    upworkApiCalls: 1,
    organizations: organizations.length,
    reason: missReason,
    ttlHours: VENDOR_ORGS_CACHE_TTL_HOURS,
    note: "cache miss, companySelector was called and the result stored",
  });

  return { organizations, clientOnly, source: "upwork" };
}
