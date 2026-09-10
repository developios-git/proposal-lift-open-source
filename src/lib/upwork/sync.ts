import type { FilterCriteria } from "@/types";
import type { UpworkJob } from "@/lib/upwork/client";
import type { UpworkQuotaContext } from "@/lib/upwork/quota";
import { fetchUpworkJobsWithFilter } from "@/lib/upwork/client";
import { buildUpworkFilter } from "@/lib/upwork/filter-mapper";
import { filterUpworkJobsByExcludeTerms } from "@/lib/jobs/filter-jobs-by-exclude-keywords";

export type FetchJobsForFilterOptions = {
  /** Pagination cursor. */
  cursor?: string | null;
};

export type FetchJobsForFilterResult = {
  jobs: UpworkJob[];
  totalCount: number;
  hasNextPage: boolean;
  endCursor: string | null;
};

/**
 * Fetch jobs for a saved filter using the Upwork API.
 *
 * All keyword terms are combined into a single OR expression by
 * `buildUpworkFilter`, so multi-keyword filters resolve in one API request.
 *
 * Reused by both the browser-triggered sync route (/api/jobs/sync) and the
 * background cron job (/api/cron/job-notifications).
 *
 * Upstream also took a `sharedBudget` flag, which counted the call against a
 * platform-wide daily budget for the shared Upwork app. Every request here is
 * made with the user's own Upwork app, against their own quota.
 */
export async function fetchJobsForFilter(
  filter: { id: string; filters: unknown },
  accessToken: string,
  quotaContext: UpworkQuotaContext,
  opts: FetchJobsForFilterOptions = {},
): Promise<FetchJobsForFilterResult> {
  const { cursor } = opts;
  const criteria = filter.filters as FilterCriteria;

  const upworkFilter = buildUpworkFilter(criteria);
  const sanitized = Object.fromEntries(
    Object.entries(upworkFilter).filter(([, v]) => v !== undefined),
  );
  const result = await fetchUpworkJobsWithFilter(
    accessToken,
    sanitized,
    50,
    cursor ?? undefined,
    { quotaContext },
  );

  const jobs = filterUpworkJobsByExcludeTerms(result.jobs, criteria);

  return {
    jobs,
    totalCount: jobs.length,
    hasNextPage: result.hasNextPage,
    endCursor: result.endCursor,
  };
}

/** The quota a filter's fetches count against — always its owner. */
export function quotaContextForFilter(filter: {
  user_id: string;
}): UpworkQuotaContext {
  return { userId: filter.user_id };
}
