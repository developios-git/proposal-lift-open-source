/** Shared types for AI Job Qualify. */

export type QualifyVerdict = "qualified" | "disqualified";

export interface QualifyResult {
  verdict: QualifyVerdict;
  /** One-line justification shown in the badge popover. */
  reason: string;
  /**
   * Criteria the model could not check against the data it was given.
   *
   * Without this the model silently drops unevaluable rules and returns
   * "qualified", which is indistinguishable from a genuine pass — the failure
   * mode that let a $186 client through a "must have 4 reviews" rule.
   */
  unverifiable: string[];
}

/**
 * The subset of a job the client sends to POST /api/jobs/qualify.
 * Jobs are never persisted — they arrive live from Upwork — so the payload has
 * to travel with the request rather than being looked up by id.
 */
export interface QualifyJobInput {
  id: string;
  title: string;
  description?: string | null;
  skills?: string[] | null;
  budget_min?: number | null;
  budget_max?: number | null;
  hourly_rate_min?: number | null;
  hourly_rate_max?: number | null;
  experience_level?: string | null;
  duration?: string | null;
  workload?: string | null;
  category?: string | null;
  subcategory?: string | null;
  /** Human-readable age ("3 hours ago") — the model cannot derive age from a timestamp. */
  posted_age?: string | null;
  /** Proposals submitted so far. Competition signal. */
  total_applicants?: number | null;
  client_country?: string | null;
  client_total_spent?: number | null;
  client_total_reviews?: number | null;
  /** Upwork's `totalFeedback`. Meaningless when the client has no reviews. */
  client_avg_rating?: number | null;
  client_total_hires?: number | null;
  client_total_posted_jobs?: number | null;
  client_payment_verified?: boolean | null;
}
