import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import type { ProposalTenant } from "@/lib/extension/membership";
import {
  clearTenantUpworkTokens,
  fetchTenantUpworkSettingsRow,
  updateTenantUpworkTokens,
  upworkOAuthColumnsForRefresh,
} from "@/lib/upwork/tenant-upwork-settings";
import { refreshUpworkTokensForRow } from "@/lib/upwork/resolve-oauth-credentials";
import { postedAtMsForSort } from "@/lib/jobs/posted-at-ms";
import {
  fetchUpworkFeedForCriteria,
} from "@/lib/jobs/fetch-upwork-feed-for-criteria";
import { UpworkQuotaExceededError } from "@/lib/upwork/quota";
import {
  FILTER_DISABLED_CODE,
  FILTER_DISABLED_MESSAGE,
  isSavedFilterFeedEligible,
  savedFilterIsEnabled,
} from "@/lib/jobs/saved-filter-feed-eligible";
import { mapUpworkNodeToDashboardJob } from "@/lib/upwork/map-upwork-node-to-dashboard-job";
import type { FilterCriteria } from "@/types";
import { NextResponse } from "next/server";

type DashboardJob = ReturnType<typeof mapUpworkNodeToDashboardJob>;

function sortJobsByPostedAtNewestFirst(jobs: DashboardJob[]): DashboardJob[] {
  return [...jobs].sort(
    (a, b) => postedAtMsForSort(b.posted_at) - postedAtMsForSort(a.posted_at),
  );
}

function dedupeJobsById(jobs: DashboardJob[]): DashboardJob[] {
  const byId = new Map<string, DashboardJob>();
  for (const j of jobs) {
    byId.set(j.id, j);
  }
  return sortJobsByPostedAtNewestFirst([...byId.values()]);
}

/** A filter the user turned off is inert: reject rather than return an empty feed. */
function filterDisabledResponse() {
  return NextResponse.json(
    { error: FILTER_DISABLED_MESSAGE, code: FILTER_DISABLED_CODE },
    { status: 400 },
  );
}


/**
 * GET /api/jobs/upwork-feed
 *
 * - Without `filterId`: one fetch per saved filter, merged; paged with `offset` after global sort.
 * - With `filterId`: single filter, single combined-keyword request; paged with `after`.
 */
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const filterIdParam = searchParams.get("filterId");
    const afterRaw = searchParams.get("after");
    const after =
      afterRaw === null || afterRaw === "" || afterRaw === "0"
        ? undefined
        : afterRaw;
    const limitParam = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 100)
      : 50;
    const offsetParam = parseInt(searchParams.get("offset") || "0", 10);
    const offset = Number.isFinite(offsetParam)
      ? Math.max(0, offsetParam)
      : 0;

    if (!filterIdParam && after) {
      return NextResponse.json(
        {
          error:
            "Load more is only available when a single saved filter is selected.",
        },
        { status: 400 },
      );
    }

    const { data: settings, error: settingsError } =
      await fetchTenantUpworkSettingsRow(serviceClient, tenant);

    if (settingsError || !settings) {
      return NextResponse.json(
        { error: "User settings not found. Open Settings once to initialize." },
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


    if (filterIdParam) {
      let filterQuery = serviceClient
        .from("saved_job_filters")
        .select("filters, is_enabled")
        .eq("id", filterIdParam);

      filterQuery = filterQuery.eq("user_id", tenant.userId);

      const { data: savedFilter, error: filterError } =
        await filterQuery.single();

      if (filterError || !savedFilter) {
        return NextResponse.json(
          { error: "Filter not found or access denied" },
          { status: 404 },
        );
      }

      if (
        !savedFilterIsEnabled(savedFilter as { is_enabled: boolean | null })
      ) {
        return filterDisabledResponse();
      }

      const criteria = (
        (savedFilter as { filters: unknown }).filters ?? {}
      ) as FilterCriteria;

      let result;
      try {
        result = await fetchUpworkFeedForCriteria(
          accessToken,
          criteria,
          limit,
          after,
          { quotaContext },
        );
      } catch (e) {
        if (e instanceof UpworkQuotaExceededError) throw e;
        console.error("Upwork feed fetch error:", e);
        const message = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json(
          { error: `Upwork request failed: ${message}` },
          { status: 502 },
        );
      }

      return NextResponse.json({
        jobs: result.jobs,
        hasNextPage: result.hasNextPage,
        endCursor: result.endCursor,
        cursors: null,
        totalCount: result.totalCount,
        emptyQuery: false,
        feedMode: "single" as const,
      });
    }

    let listQuery = serviceClient
      .from("saved_job_filters")
      .select("id, filters, is_enabled");

    listQuery = listQuery.eq("user_id", tenant.userId);

    const { data: savedRows, error: filtersError } = await listQuery;

    if (filtersError) {
      console.error("saved_job_filters load error:", filtersError);
      return NextResponse.json(
        { error: "Failed to load saved filters" },
        { status: 500 },
      );
    }

    const rows = (savedRows ?? []) as Array<{
      id: string;
      filters: unknown;
      is_enabled: boolean | null;
    }>;

    // Disabled filters drop out here, so the merged "all filters" view never
    // spends an Upwork request on one. All-disabled falls into the emptyQuery
    // return below with no fetch at all.
    const rowsWithTerms = rows.filter(isSavedFilterFeedEligible);

    if (rowsWithTerms.length === 0) {
      return NextResponse.json({
        jobs: [],
        hasNextPage: false,
        endCursor: null,
        cursors: null,
        totalCount: 0,
        emptyQuery: true,
        feedMode: "all" as const,
      });
    }

    const perFilterResults = await Promise.all(
      rowsWithTerms.map(async (row) => {
        const criteria = (row.filters ?? {}) as FilterCriteria;
        try {
          const result = await fetchUpworkFeedForCriteria(
            accessToken,
            criteria,
            limit,
            undefined,
            { quotaContext },
          );
          return result.jobs;
        } catch (e) {
          if (e instanceof UpworkQuotaExceededError) throw e;
          console.error(`Upwork feed fetch error for filter ${row.id}:`, e);
          return [] as DashboardJob[];
        }
      }),
    );

    const merged = dedupeJobsById(perFilterResults.flat());
    const page = merged.slice(offset, offset + limit);
    const hasNextPage = merged.length > offset + limit;

    return NextResponse.json({
      jobs: page,
      hasNextPage,
      endCursor: null,
      cursors: null,
      totalCount: merged.length,
      emptyQuery: false,
      feedMode: "all" as const,
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
    console.error("Upwork feed route error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Job feed failed: ${message}` },
      { status: 500 },
    );
  }

}
