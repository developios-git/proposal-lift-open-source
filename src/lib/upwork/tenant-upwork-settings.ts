import type { ProposalTenant } from "@/lib/extension/membership";
import type { UpworkVendorOrganization } from "@/lib/upwork/select-vendor-organizations";
import { VENDOR_ORGS_CACHE_CLEAR_PAYLOAD } from "@/lib/upwork/vendor-orgs-cache";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;
type SettingsRow = Database["public"]["Tables"]["user_settings"]["Row"];

/**
 * Every function here was an `organization_settings` / `user_settings` branch on
 * `tenant.mode`. `organization_settings` does not exist in this build, so only
 * the user arm survives — the column names were identical either way.
 */

/** Load the Upwork + OAuth credential columns used for token refresh. */
export async function fetchTenantUpworkSettingsRow(
  serviceClient: Db,
  tenant: ProposalTenant,
) {
  return serviceClient
    .from("user_settings")
    .select("*")
    .eq("user_id", tenant.userId)
    .single();
}

/** Narrows a settings row to the pair `refreshUpworkTokens` needs. */
export function upworkOAuthColumnsForRefresh(
  row: Record<string, unknown>,
): Pick<SettingsRow, "upwork_client_id" | "upwork_client_secret_encrypted"> {
  return {
    upwork_client_id: row.upwork_client_id as string | null,
    upwork_client_secret_encrypted:
      row.upwork_client_secret_encrypted as string | null,
  };
}

export async function updateTenantUpworkTokens(
  serviceClient: Db,
  tenant: ProposalTenant,
  tokens: {
    upwork_access_token: string;
    upwork_refresh_token: string;
    upwork_token_expires_at?: string | null;
  },
) {
  return serviceClient
    .from("user_settings")
    .update({
      upwork_access_token: tokens.upwork_access_token,
      upwork_refresh_token: tokens.upwork_refresh_token,
      upwork_token_expires_at: tokens.upwork_token_expires_at ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", tenant.userId);
}

/**
 * Store the vendor orgs read back from Upwork's `companySelector`.
 *
 * These are Upwork's OWN organizations — the agencies and freelancer profiles a
 * person can send proposals from — and are unrelated to the removed tenancy.
 * Only the post-filter list is persisted (see `selectVendorOrganizations`), so
 * client-side orgs never reach the database.
 */
export async function updateTenantVendorOrgsCache(
  serviceClient: Db,
  tenant: ProposalTenant,
  value: {
    organizations: UpworkVendorOrganization[];
    clientOnly: boolean;
    fetchedAt: string;
  },
) {
  return serviceClient
    .from("user_settings")
    .update({
      upwork_vendor_orgs: value.organizations as never,
      upwork_vendor_orgs_client_only: value.clientOnly,
      upwork_vendor_orgs_fetched_at: value.fetchedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", tenant.userId);
}

export async function clearTenantUpworkTokens(
  serviceClient: Db,
  tenant: ProposalTenant,
) {
  return serviceClient
    .from("user_settings")
    .update({
      upwork_access_token: null,
      upwork_refresh_token: null,
      upwork_token_expires_at: null,
      upwork_connected_at: null,
      // The cached vendor orgs describe this connection, so they die with it.
      ...VENDOR_ORGS_CACHE_CLEAR_PAYLOAD,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", tenant.userId);
}
