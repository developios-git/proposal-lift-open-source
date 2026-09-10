/**
 * Competition level derived from a job's applicant count.
 *
 * Shared by the filter feed row and the Jobs dashboard card so the two surfaces
 * cannot drift apart. Thresholds are product decisions, not Upwork's — Upwork
 * only gives us the raw `totalApplicants` number.
 */

export type CompetitionLevel = "low" | "medium" | "high";

/** Upper bound of the "low" band, inclusive. */
export const COMPETITION_LOW_MAX = 19;
/** Upper bound of the "medium" band, inclusive. Anything above is "high". */
export const COMPETITION_MEDIUM_MAX = 30;

/** Slider bounds for the applicant range filter. */
export const APPLICANTS_RANGE_MIN = 0;
export const APPLICANTS_RANGE_MAX = 200;
export const APPLICANTS_RANGE_STEP = 2;

/**
 * `null` when the count is unknown — Upwork omits `totalApplicants` on some
 * postings, and an absent count is not the same as zero applicants.
 */
export function getCompetitionLevel(
  totalApplicants: number | null | undefined,
): CompetitionLevel | null {
  if (totalApplicants == null || !Number.isFinite(totalApplicants)) return null;
  if (totalApplicants < 0) return null;
  if (totalApplicants <= COMPETITION_LOW_MAX) return "low";
  if (totalApplicants <= COMPETITION_MEDIUM_MAX) return "medium";
  return "high";
}

const COMPETITION_LABELS: Record<CompetitionLevel, string> = {
  low: "low competition",
  medium: "medium competition",
  high: "high competition",
};

/** Hover text for the badge, e.g. "47 applicants, high competition". */
export function getCompetitionTooltip(
  totalApplicants: number | null | undefined,
): string | null {
  const level = getCompetitionLevel(totalApplicants);
  if (level === null) return null;
  const plural = totalApplicants === 1 ? "applicant" : "applicants";
  return `${totalApplicants} ${plural}, ${COMPETITION_LABELS[level]}`;
}

/**
 * Whether the range differs from the full 0..200 default.
 *
 * Drives whether `buildUpworkFilter` emits `proposalRange_eq` — the filtering
 * itself happens at the Upwork API, not here.
 */
export function hasActiveApplicantRange(
  min: number | null | undefined,
  max: number | null | undefined,
): boolean {
  const lo = min ?? APPLICANTS_RANGE_MIN;
  const hi = max ?? APPLICANTS_RANGE_MAX;
  return lo > APPLICANTS_RANGE_MIN || hi < APPLICANTS_RANGE_MAX;
}
