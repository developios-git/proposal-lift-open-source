import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  fetchTenantUpworkSettingsRow,
  updateTenantUpworkTokens,
  clearTenantUpworkTokens,
  upworkOAuthColumnsForRefresh,
} from "@/lib/upwork/tenant-upwork-settings";
import { refreshUpworkTokensForRow } from "@/lib/upwork/resolve-oauth-credentials";
import type { ProposalTenant } from "@/lib/extension/membership";

type Db = SupabaseClient<Database>;

export class UpworkTokenMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpworkTokenMissingError";
  }
}

export class UpworkTokenRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpworkTokenRefreshError";
  }
}

/**
 * Load a valid Upwork access token for a user using the service-role client.
 *
 * Used by the cron job, which runs without a user session and cannot rely on
 * the cookie-based Supabase client used by the browser-triggered sync route.
 *
 * - If the token is still valid: returns it immediately.
 * - If the token is expired: refreshes via Upwork OAuth, saves the new tokens,
 *   and returns the fresh access token.
 * - If tokens are missing: throws UpworkTokenMissingError (filter should be skipped).
 * - If refresh fails: clears the stored tokens and throws UpworkTokenRefreshError
 *   (user must reconnect their Upwork account).
 */
export async function ensureValidAccessToken(
  serviceClient: Db,
  tenant: ProposalTenant,
): Promise<string> {
  const { data: settings, error: settingsError } =
    await fetchTenantUpworkSettingsRow(serviceClient, tenant);

  if (settingsError || !settings) {
    throw new UpworkTokenMissingError("User settings not found");
  }

  const row = settings as Record<string, unknown>;

  if (!row.upwork_access_token || !row.upwork_refresh_token) {
    throw new UpworkTokenMissingError(
      "Upwork is not connected. Please connect your Upwork account in Settings.",
    );
  }

  const accessToken = row.upwork_access_token as string;
  const refreshToken = row.upwork_refresh_token as string;
  const expiresAt = row.upwork_token_expires_at as string | null;

  const isExpired = expiresAt
    ? new Date(expiresAt).getTime() <= Date.now()
    : false;

  if (!isExpired) {
    return accessToken;
  }

  try {
    const newTokens = await refreshUpworkTokensForRow(
      upworkOAuthColumnsForRefresh(row),
      refreshToken,
    );

    await updateTenantUpworkTokens(serviceClient, tenant, {
      upwork_access_token: newTokens.access_token,
      upwork_refresh_token: newTokens.refresh_token,
      upwork_token_expires_at: newTokens.expires_at,
    });

    return newTokens.access_token;
  } catch (err) {
    await clearTenantUpworkTokens(serviceClient, tenant);
    throw new UpworkTokenRefreshError(
      `Upwork token refresh failed for user ${tenant.userId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
