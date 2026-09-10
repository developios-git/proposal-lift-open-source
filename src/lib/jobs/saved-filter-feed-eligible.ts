import { savedFilterHasKeywordTerms } from "./saved-filter-has-keyword-terms";

/**
 * Shared error contract for a filter the user turned off. Mirrors the
 * QUALIFY_DISABLED shape in /api/jobs/qualify: 400 + a machine-readable `code`
 * so clients can tell "disabled" apart from a genuine failure.
 */
export const FILTER_DISABLED_CODE = "FILTER_DISABLED";
export const FILTER_DISABLED_MESSAGE =
  "This filter is disabled. Enable it on the Filters page to use it.";

/**
 * `saved_job_filters.is_enabled` is NOT NULL DEFAULT true, so the only way to
 * observe a nullish value is a select that omitted the column. Fail open there:
 * blanking someone's whole feed over a missing column is far worse than one
 * extra fetch.
 */
export function savedFilterIsEnabled(row: {
  is_enabled: boolean | null;
}): boolean {
  return row.is_enabled !== false;
}

/**
 * A saved filter drives an Upwork search only when it is enabled *and* carries
 * keyword terms. Every fan-out site (jobs feed, filter sync, notifications cron)
 * shares this predicate so they cannot drift apart on what "usable" means.
 *
 * `is_enabled` is a required property on purpose: a caller that forgets it in
 * its `.select()` string fails to compile rather than silently failing open.
 */
export function isSavedFilterFeedEligible(row: {
  is_enabled: boolean | null;
  filters: unknown;
}): boolean {
  return savedFilterIsEnabled(row) && savedFilterHasKeywordTerms(row.filters);
}
