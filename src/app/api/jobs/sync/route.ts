import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { searchUpworkJobs } from "@/lib/upwork/client";
import type { ProposalTenant } from "@/lib/extension/membership";
import {
  clearTenantUpworkTokens,
  fetchTenantUpworkSettingsRow,
  updateTenantUpworkTokens,
  upworkOAuthColumnsForRefresh,
} from "@/lib/upwork/tenant-upwork-settings";
import { refreshUpworkTokensForRow } from "@/lib/upwork/resolve-oauth-credentials";
import { fetchJobsForFilter } from "@/lib/upwork/sync";
import { applyHireRateFilter } from "@/lib/upwork/apply-frontend-filters";
import { NextResponse } from "next/server";
import type { UpworkJob } from "@/lib/upwork/client";
import type { FilterCriteria } from "@/types";

import { UpworkQuotaExceededError } from "@/lib/upwork/quota";
import {
  FILTER_DISABLED_CODE,
  FILTER_DISABLED_MESSAGE,
  savedFilterIsEnabled,
} from "@/lib/jobs/saved-filter-feed-eligible";
/**
 * POST /api/jobs/sync
 *
 * Syncs jobs from the Upwork API into the local jobs table.
 *
 * Flow:
 * 1. Verify user is authenticated
 * 2. Load org settings (tokens + search terms)
 * 3. Refresh tokens if expired
 * 4. If filterId provided: load saved filter, apply criteria via Upwork API
 *    Else: search Upwork for jobs matching configured search terms
 * 5. Map + upsert jobs into the database
 * 6. Return count of synced jobs
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    // Step 1: Verify auth
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
        {
          error: "User settings not found. Open Settings once to initialize.",
        },
        { status: 400 },
      );
    }

    const settingsRow = settings as Record<string, unknown>;


    if (!settingsRow.upwork_access_token || !settingsRow.upwork_refresh_token) {
      return NextResponse.json(
        {
          error:
            "Upwork is not connected. Please connect your Upwork account first.",
        },
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
        console.error("Failed to refresh Upwork tokens:", refreshError);

        await clearTenantUpworkTokens(serviceClient, tenant);

        return NextResponse.json(
          {
            error:
              "Upwork session expired. Please reconnect your Upwork account.",
          },
          { status: 401 },
        );
      }
    }

    // Step 4: Determine search strategy - filter or default search terms
    const body = await request.json().catch(() => ({}));
    const filterId = typeof body?.filterId === "string" ? body.filterId : null;
    const cursor = typeof body?.cursor === "string" ? body.cursor : null;
    // `refresh` is sent ONLY by the "Save Changes" action. Opening or reloading
    // the filter page sends no flag and must never hit Upwork.

    // Loaded up front because both the disabled-filter check and the live
    // fetch below need its criteria to apply the hire rate filter server-side.
    // A miss stays null here so the "not found" 404 fires only where it did
    // before — on the live-fetch path.
    let savedFilter: {
      id: string;
      filters: unknown;
      is_enabled: boolean | null;
    } | null = null;
    if (filterId) {
      let filterQuery = serviceClient
        .from("saved_job_filters")
        .select("id, filters, is_enabled")
        .eq("id", filterId);

      filterQuery = filterQuery.eq("user_id", tenant.userId);

      const { data } = await filterQuery.single();
      savedFilter =
        (data as {
          id: string;
          filters: unknown;
          is_enabled: boolean | null;
        } | null) ?? null;
    }

    // A disabled filter is inert on every path: no Upwork fetch below, and no
    // fetch below is skipped. A missing/foreign id keeps its existing behaviour.
    if (savedFilter && !savedFilterIsEnabled(savedFilter)) {
      return NextResponse.json(
        { error: FILTER_DISABLED_MESSAGE, code: FILTER_DISABLED_CODE },
        { status: 400 },
      );
    }

    const filterCriteria = (savedFilter?.filters ?? null) as FilterCriteria | null;

    /** Hire rate is the one post-filter the browser no longer decides. */
    const withHireRateFilter = (list: UpworkJob[]): UpworkJob[] =>
      filterCriteria ? applyHireRateFilter(list, filterCriteria) : list;


    let jobs: UpworkJob[];
    let totalCount: number;
    let hasNextPage: boolean;
    let endCursor: string | null;
    let searchTerms: string | undefined;

    if (filterId) {
      if (!savedFilter) {
        return NextResponse.json(
          { error: "Filter not found or access denied" },
          { status: 404 },
        );
      }

      const result = await fetchJobsForFilter(
        savedFilter,
        accessToken,
        quotaContext,
        { cursor },
      );

      jobs = result.jobs;
      totalCount = result.totalCount;
      hasNextPage = result.hasNextPage;
      endCursor = result.endCursor;
    } else {
      searchTerms =
        (settingsRow.upwork_search_terms as string) || "web development";
      const result = await searchUpworkJobs(
        accessToken,
        searchTerms,
        50,
        cursor ?? undefined,
        { quotaContext },
      );
      jobs = result.jobs;
      totalCount = result.totalCount;
      hasNextPage = result.hasNextPage;
      endCursor = result.endCursor;
    }

    if (jobs.length === 0) {
      return NextResponse.json({
        synced: 0,
        totalFound: totalCount,
        hasNextPage: false,
        endCursor: null,
        message: filterId
          ? "No jobs found matching filter criteria"
          : "No jobs found matching search terms",
      });
    }


    // const { data: upserted, error: upsertError } = await serviceClient
    //   .from("jobs")
    //   .upsert(mappedJobs, {
    //     onConflict: "upwork_id",
    //     ignoreDuplicates: false, // Update existing records with fresh data
    //   })
    //   .select("id");

    // if (upsertError) {
    //   console.error("Job upsert error:", upsertError);
    //   return NextResponse.json(
    //     { error: "Failed to save jobs to database" },
    //     { status: 500 },
    //   );
    // }

    return NextResponse.json({
      // synced: upserted?.length || 0,
      // Filtered on the way out only — `jobs` above stays raw so the
      // snapshot written earlier can still widen when the minimum is lowered.
      jobs: withHireRateFilter(jobs),
      totalFound: totalCount,
      hasNextPage,
      endCursor,
      searchTerms,
    });
  } catch (error) {
    if (error instanceof UpworkQuotaExceededError) {
      return NextResponse.json(
        {
          error: "upwork_quota_exceeded",
          message: error.message,
          used: error.used,
          limit: error.limit,
          resetAt: error.resetAt,
        },
        { status: 429 },
      );
    }
    console.error("Job sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Job sync failed: ${message}` },
      { status: 500 },
    );
  }
}

// ---------- Helpers ----------

/**
 * Map an Upwork GraphQL job node to our jobs table schema.
 */

/**
 * Infer whether a job is fixed-price or hourly based on engagement and amount fields.
 */

/**
 * Normalize the Upwork experience level to our schema values.
 */
