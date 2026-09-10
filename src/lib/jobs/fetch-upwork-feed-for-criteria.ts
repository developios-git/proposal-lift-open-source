import {
  fetchUpworkJobsWithFilter,
  type UpworkGraphqlRequestOptions,
  type UpworkJob,
} from "@/lib/upwork/client";
import { buildUpworkFilter } from "@/lib/upwork/filter-mapper";
import { mapUpworkNodeToDashboardJob } from "@/lib/upwork/map-upwork-node-to-dashboard-job";
import type { FilterCriteria } from "@/types";
import { applyFrontendFilters } from "@/lib/upwork/apply-frontend-filters";
import { filterUpworkJobsByExcludeTerms } from "@/lib/jobs/filter-jobs-by-exclude-keywords";
import { postedAtMsForSort } from "@/lib/jobs/posted-at-ms";

export type DashboardJob = ReturnType<typeof mapUpworkNodeToDashboardJob>;

function sanitizeFilter(
  filter: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== undefined && v !== null),
  ) as Record<string, unknown>;
}

function sortDashboardJobsNewestFirst(jobs: DashboardJob[]): DashboardJob[] {
  return [...jobs].sort(
    (a, b) => postedAtMsForSort(b.posted_at) - postedAtMsForSort(a.posted_at),
  );
}

/**
 * Turn raw Upwork nodes into dashboard-shaped jobs for a filter's criteria:
 * exclude terms → `applyFrontendFilters` (fields Upwork's API can't filter) →
 * map → newest-first sort. This is the post-fetch half of
 * `fetchUpworkFeedForCriteria`, extracted so the shared-mode Jobs feed can apply
 * the same transform when reading raw `filter:<id>` snapshots from the DB.
 * (Exclude is idempotent, so re-applying it on an already-exclude-filtered
 * snapshot is a safe no-op.)
 */
export function processRawUpworkJobsForCriteria(
  rawJobs: UpworkJob[],
  criteria: FilterCriteria,
): DashboardJob[] {
  const jobsAfterExclude = filterUpworkJobsByExcludeTerms(rawJobs, criteria);
  const jobsAfterAdvancedFilters = applyFrontendFilters(
    jobsAfterExclude,
    criteria,
  );
  const jobs = jobsAfterAdvancedFilters.map((node) =>
    mapUpworkNodeToDashboardJob(node as unknown as Record<string, unknown>),
  );
  return sortDashboardJobsNewestFirst(jobs);
}

export type UpworkFeedForCriteriaResult = {
  jobs: DashboardJob[];
  totalCount: number;
  hasNextPage: boolean;
  endCursor: string | null;
};

/**
 * Fetch the Upwork feed for a saved filter's criteria. All keyword terms are
 * combined into a single OR expression by buildUpworkFilter, so multi-keyword
 * filters resolve in one Upwork API request (same strategy as
 * fetchJobsForFilter / POST /api/jobs/sync).
 *
 * Also applies `applyFrontendFilters` for criteria fields Upwork's API
 * doesn't support (total spend, rating, avoid locations, project length,
 * multi-select experience level, hours per week) — the same post-filter the
 * /filter/[id] page and job-alert cron already rely on, so results match
 * across all three surfaces.
 */
export async function fetchUpworkFeedForCriteria(
  accessToken: string,
  criteria: FilterCriteria,
  limit: number,
  after: string | undefined,
  options?: UpworkGraphqlRequestOptions,
): Promise<UpworkFeedForCriteriaResult> {
  const upworkFilter = buildUpworkFilter(criteria);
  const sanitized = sanitizeFilter(upworkFilter as Record<string, unknown>);
  if (Object.keys(sanitized).length === 0) {
    return { jobs: [], totalCount: 0, hasNextPage: false, endCursor: null };
  }

  const result = await fetchUpworkJobsWithFilter(
    accessToken,
    sanitized,
    limit,
    after,
    options,
  );
  const sortedJobs = processRawUpworkJobsForCriteria(result.jobs, criteria);

  return {
    jobs: sortedJobs,
    totalCount: sortedJobs.length,
    hasNextPage: result.hasNextPage,
    endCursor: result.endCursor,
  };
}
