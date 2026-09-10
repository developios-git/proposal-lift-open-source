import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { fetchVendorProposalById } from "@/lib/upwork/client";
import { resolveVendorOrganizations } from "@/lib/upwork/resolve-vendor-organizations";
import { pickDashboardVendorContext } from "@/lib/upwork/select-vendor-organizations";
import { UpworkQuotaExceededError } from "@/lib/upwork/quota";
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
 * GET /api/dashboard/upwork-activity/:id
 *
 * Single Upwork vendor proposal (GraphQL vendorProposal query).
 * Query: `context` — same as GET /api/dashboard/upwork-activity.
 */
export async function GET(request: Request,
  context: { params: Promise<{ id: string }> },) {
  try {
    const { id: vendorProposalId } = await context.params;
    if (!vendorProposalId) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

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
      return NextResponse.json(
        { error: "Upwork is not connected" },
        { status: 400 },
      );
    }

    const settingsRow = settings as Record<string, unknown>;
    if (!settingsRow.upwork_access_token || !settingsRow.upwork_refresh_token) {
      return NextResponse.json(
        { error: "Upwork is not connected" },
        { status: 400 },
      );
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
          "Upwork token refresh failed (upwork-activity detail):",
          refreshError,
        );
        await clearTenantUpworkTokens(serviceClient, tenant);
        return NextResponse.json(
          {
            error:
              "Upwork session expired. Reconnect your Upwork account in Settings.",
          },
          { status: 401 },
        );
      }
    }

    const contextParam = new URL(request.url).searchParams.get("context");

    const { organizations } = await resolveVendorOrganizations(
      serviceClient,
      tenant,
      accessToken,
      { settingsRow, quotaContext },
    );
    const upworkCtx = pickDashboardVendorContext(organizations, contextParam);

    const detail = await fetchVendorProposalById(accessToken, vendorProposalId, {
      tenantId: upworkCtx.tenantId,
      quotaContext,
    });

    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
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
    console.error("upwork-activity detail:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

}
