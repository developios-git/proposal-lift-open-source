import type { ProposalTenant } from "@/lib/extension/membership";
import { VENDOR_ORGS_CACHE_CLEAR_PAYLOAD } from "@/lib/upwork/vendor-orgs-cache";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;

/**
 * Every column that must be nulled when a user removes their Upwork app.
 *
 * Spread this rather than repeating the keys. There are two callers — the
 * `upwork_client_id: null` branch of `PUT /api/settings` and
 * `DELETE /api/upwork/credentials` — and they must never disagree about what
 * removal means.
 *
 * Why the tokens go too: Upwork's refresh grant authenticates with the client id
 * and secret, so a refresh token kept without them is unusable, and the first
 * expiry would have `ensureValidAccessToken` clear it anyway. Clearing now only
 * avoids one access-token lifetime of zombie access.
 *
 * A credential *rotation* is not a removal: the same Upwork account reconnects
 * to a new app, so the rotation path must not spread this payload.
 *
 * Upstream this also cleared four shared-mode columns and `upwork_ciphertext`.
 * None of those columns exist here.
 */
export const UPWORK_CREDENTIALS_REMOVAL_PAYLOAD = Object.freeze({
  // App credentials.
  upwork_client_id: null,
  upwork_client_secret_encrypted: null,
  upwork_oauth_credentials_updated_at: null,
  // OAuth tokens.
  upwork_access_token: null,
  upwork_refresh_token: null,
  upwork_token_expires_at: null,
  upwork_connected_at: null,
  // Caches that describe the connection being dropped.
  ...VENDOR_ORGS_CACHE_CLEAR_PAYLOAD,
});

/**
 * Remove a user's Upwork app credentials and everything derived from them.
 *
 * The settings route builds its own update object (it merges other fields in the
 * same request), so it spreads `UPWORK_CREDENTIALS_REMOVAL_PAYLOAD` directly.
 * This function is the standalone path used by `DELETE /api/upwork/credentials`.
 *
 * Upstream also dropped a `shared_job_feed_cache` row here; that table does not
 * exist in this build.
 */
export async function removeTenantUpworkCredentials(
  serviceClient: Db,
  tenant: ProposalTenant,
): Promise<{ error: string | null }> {
  // A user may have no settings row yet, so upsert — removal should be
  // idempotent rather than a silent no-op on a missing row.
  const { error } = await serviceClient.from("user_settings").upsert(
    {
      user_id: tenant.userId,
      ...UPWORK_CREDENTIALS_REMOVAL_PAYLOAD,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  return { error: error ? error.message : null };
}
