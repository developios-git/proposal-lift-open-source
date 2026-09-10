import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { resolveVendorOrganizations } from "@/lib/upwork/resolve-vendor-organizations";
import {
  UpworkQuotaExceededError,
} from "@/lib/upwork/quota";
import {
  clearTenantUpworkTokens,
  fetchTenantUpworkSettingsRow,
  updateTenantUpworkTokens,
  upworkOAuthColumnsForRefresh,
} from "@/lib/upwork/tenant-upwork-settings";
import { refreshUpworkTokensForRow } from "@/lib/upwork/resolve-oauth-credentials";
import type { ProposalTenant } from "@/lib/extension/membership";
import { NextResponse } from "next/server";


/**
 * GET /api/dashboard/upwork-contexts
 *
 * Vendor-side Upwork identities (freelancer + agency) for the connected
 * account, for the dashboard scope picker. Client-side orgs are excluded.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant: ProposalTenant = { userId: user.id };

    const quotaContext = { userId: user.id };
    const serviceClient = createSupabaseServiceClient();

    const { data: settings, error: settingsError } =
      await fetchTenantUpworkSettingsRow(serviceClient, tenant);

    if (settingsError || !settings) {
      return NextResponse.json({ contexts: [], skipped: true });
    }

    const settingsRow = settings as Record<string, unknown>;

    if (!settingsRow.upwork_access_token || !settingsRow.upwork_refresh_token) {
      return NextResponse.json({ contexts: [], skipped: true });
    }

    let accessToken = settingsRow.upwork_access_token as string;
    const refreshToken = settingsRow.upwork_refresh_token as string;
    const tokenExpiresAt = settingsRow.upwork_token_expires_at as string | null;

    const isExpired = tokenExpiresAt
      ? new Date(tokenExpiresAt).getTime() <= Date.now()
      : false;

    if (isExpired) {
      try {
        const newTokens = await refreshUpworkTokensForRow(
          upworkOAuthColumnsForRefresh(settingsRow),
          refreshToken,
        );

        await updateTenantUpworkTokens(serviceClient, tenant, {
          upwork_access_token: newTokens.access_token,
          upwork_refresh_token: newTokens.refresh_token,
          upwork_token_expires_at: newTokens.expires_at,
        });

        accessToken = newTokens.access_token;
      } catch (refreshError) {
        console.error(
          "Upwork token refresh failed (upwork-contexts):",
          refreshError,
        );
        await clearTenantUpworkTokens(serviceClient, tenant);
        return NextResponse.json({
          contexts: [],
          error:
            "Upwork session expired. Reconnect your Upwork account in Settings.",
        });
      }
    }

    // Cached for 7h on this same settings row, so a warm load costs no Upwork call.
    const { organizations, clientOnly } = await resolveVendorOrganizations(
      serviceClient,
      tenant,
      accessToken,
      { quotaContext, settingsRow },
    );

    return NextResponse.json({ contexts: organizations, clientOnly });
  } catch (e) {
    if (e instanceof UpworkQuotaExceededError) {
      return NextResponse.json(
        {
          error: "upwork_quota_exceeded",
          message: e.message,
          used: e.used,
          limit: e.limit,
          resetAt: e.resetAt,
        },
        { status: 429 },
      );
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("upwork-contexts:", message);
    return NextResponse.json({ contexts: [], error: message });
  }
}
