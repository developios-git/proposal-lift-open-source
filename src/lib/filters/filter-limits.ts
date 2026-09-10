/** Shared count limit for saved job filters. Server is authoritative; the UI mirrors it. */

/**
 * Max saved job filters one user may own.
 *
 * Every filter is polled independently — by the job feed and, once scheduled,
 * by `/api/cron/job-notifications` — and each poll spends that user's own
 * Upwork API quota. Capping the count bounds that spend.
 *
 * Enforced on every creation path (`POST /api/filters` and the duplicate
 * route), never by deletion: a user already over the cap keeps every filter
 * they have. See `atFilterLimit`.
 */
export const MAX_FILTERS_PER_USER = 4;

/**
 * Whether a user holding `ownedCount` filters is blocked from creating another.
 *
 * Deliberately `>=` rather than `===`, so a user who somehow sits above the cap
 * is blocked from adding more instead of slipping past an equality check. The
 * cap blocks growth; it never truncates what is already saved.
 */
export function atFilterLimit(ownedCount: number): boolean {
  return ownedCount >= MAX_FILTERS_PER_USER;
}
