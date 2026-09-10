/**
 * Client hire rate: the share of a client's job posts that ended in a hire.
 *
 * Upwork's `MarketplaceJobPostingsSearchFilter` has no hire-rate field — only
 * `clientHiresRange_eq`, the raw hire count — so the rate is derived from
 * `totalHires` / `totalPostedJobs` and applied after the fetch, alongside the
 * other post-filters in apply-frontend-filters.
 *
 * Shared by the `/filter/[id]` feed, the `/jobs` dashboard feed, and the
 * job-notification cron so the three surfaces cannot drift apart.
 */

/** Upper bound of the hire rate, in percent. See `computeClientHireRate`. */
export const HIRE_RATE_MAX = 100;

/**
 * Whole percentage 0..100, or `null` when there is nothing to divide.
 *
 * Capped at 100 because Upwork counts hires per freelancer while
 * `totalPostedJobs` counts posts: a client who hired three people across two
 * posts computes to 150%. Upwork's own client profile caps it the same way.
 *
 * A client with no posts yields `null`, not 0 — an absent rate is not the same
 * as a client who never hires. `jobMatchesHireRateMin` relies on that
 * distinction.
 */
export function computeClientHireRate(
  totalHires: number | null | undefined,
  totalPostedJobs: number | null | undefined,
): number | null {
  if (totalHires == null || totalPostedJobs == null) return null;
  if (!Number.isFinite(totalHires) || !Number.isFinite(totalPostedJobs)) return null;
  if (totalHires < 0 || totalPostedJobs <= 0) return null;
  return Math.min(HIRE_RATE_MAX, Math.round((totalHires / totalPostedJobs) * 100));
}

/**
 * Whether a job clears a saved filter's `client_details.hire_rate_min`.
 *
 * A `null` rate passes: Upwork gave us no usable numbers, and hiding on missing
 * data would drop clients posting their very first job. A client who has posted
 * but never hired computes to a real 0 and so fails any minimum above zero.
 */
export function jobMatchesHireRateMin(
  rate: number | null,
  minRate: number | null | undefined,
): boolean {
  if (minRate == null || minRate <= 0) return true;
  if (rate == null) return true;
  return rate >= minRate;
}

/** Popover copy, e.g. "38% hire rate". `null` when the rate is not derivable. */
export function formatClientHireRate(rate: number | null): string | null {
  return rate == null ? null : `${rate}% hire rate`;
}
