import type { FilterCriteria } from "@/types";
import {
  APPLICANTS_RANGE_MAX,
  APPLICANTS_RANGE_MIN,
  hasActiveApplicantRange,
} from "@/lib/jobs/competition-level";

/**
 * Upwork MarketplaceJobPostingsSearchFilter — field names and types
 * discovered via GraphQL introspection of the live Upwork API.
 *
 * Supported filter fields:
 *   searchExpression_eq    String         — combined title + description (no description-only field)
 *   titleExpression_eq     String         — title-only search
 *   skillExpression_eq     String         — skills search (see applyKeywordSearchFields)
 *   jobType_eq             ContractType   — HOURLY | FIXED
 *   workload_eq            EngagementType — FULL_TIME | PART_TIME | AS_NEEDED | NOT_SURE
 *   hourlyRate_eq          IntRange       — { rangeStart, rangeEnd }
 *   budgetRange_eq         IntRange       — { rangeStart, rangeEnd }  (fixed-price budget)
 *   experienceLevel_eq     ExperienceLevel — ENTRY_LEVEL | INTERMEDIATE | EXPERT  (single value)
 *   clientHiresRange_eq    IntRange       — { rangeStart, rangeEnd }
 *   verifiedPaymentOnly_eq Boolean
 *   enterpriseOnly_eq      Boolean
 *   proposalRange_eq       IntRange       — { rangeStart, rangeEnd }  (applicant count)
 *   locations_any          [String!]      — client locations
 *   previousClients_eq     Boolean
 *   pagination_eq          Pagination     — { first, after }
 *
 * NOT available as API filter (must be done client-side if needed):
 *   clientTotalSpendMin — no such field
 *   durationV3_in      — no such field
 *   weeklyHours_in     — no such field
 *   required_connects  — no such field (proposalRange_eq is applicants, not connects)
 */

export interface UpworkJobFilter {
  titleExpression_eq?: string;
  searchExpression_eq?: string;
  skillExpression_eq?: string;
  jobType_eq?: string; // ContractType enum: "HOURLY" | "FIXED"
  workload_eq?: string; // EngagementType enum
  hourlyRate_eq?: { rangeStart?: number; rangeEnd?: number };
  budgetRange_eq?: { rangeStart?: number; rangeEnd?: number };
  experienceLevel_eq?: string; // ExperienceLevel enum (single value)
  clientHiresRange_eq?: { rangeStart?: number; rangeEnd?: number };
  verifiedPaymentOnly_eq?: boolean;
  enterpriseOnly_eq?: boolean;
  proposalRange_eq?: { rangeStart?: number; rangeEnd?: number };
  locations_any?: string[];
  previousClients_eq?: boolean;
  pagination_eq?: { first: number; after: string };
}

const EXPERIENCE_MAP: Record<string, string> = {
  entry: "ENTRY_LEVEL",
  intermediate: "INTERMEDIATE",
  expert: "EXPERT",
};

type KeywordSearchSurfaces = {
  hasTitle: boolean;
  hasDescription: boolean;
  hasSkills: boolean;
};

/**
 * Quotes a term for Lucene syntax (titleExpression_eq / searchExpression_eq):
 * multi-word terms need quoting so they're matched as a phrase rather than
 * as separate OR'd words.
 */
function quoteLuceneTerm(term: string): string {
  const t = String(term).trim();
  if (!t) return "";
  const escaped = t.replace(/"/g, '\\"');
  return escaped.includes(" ") ? `"${escaped}"` : escaped;
}

/**
 * Builds a single Lucene expression that OR's all terms together, for
 * titleExpression_eq / searchExpression_eq. Per Upwork's schema docs these
 * fields "support partial Lucene syntax" — an explicit `OR` (not a bare
 * space join, which Upwork resolves as AND) is required to match any term.
 */
function buildTitleOrSearchExpression(terms: string[]): string {
  const parts = terms.map(quoteLuceneTerm).filter(Boolean);
  return parts.length <= 1 ? (parts[0] ?? "") : parts.join(" OR ");
}

/**
 * Builds skillExpression_eq's value. Per Upwork's schema docs, multiple
 * skills separated by commas are combined with a Boolean OR automatically.
 */
function buildSkillExpression(terms: string[]): string {
  return terms
    .map((t) => String(t).trim())
    .filter(Boolean)
    .join(",");
}

/**
 * Maps `keywords.search_in` checkboxes to Upwork expression fields.
 * Multiple fields may be set; Upwork applies them together on the query.
 * All `terms` are combined into a single expression per field (OR semantics)
 * so multi-keyword filters only need one Upwork API request.
 */
function applyKeywordSearchFields(
  filter: UpworkJobFilter,
  surfaces: KeywordSearchSurfaces,
  terms: string[],
): void {
  const { hasTitle, hasDescription, hasSkills } = surfaces;
  const titleOrSearchExpr = buildTitleOrSearchExpression(terms);
  const skillExpr = buildSkillExpression(terms);

  if (hasSkills && !hasTitle && !hasDescription) {
    filter.skillExpression_eq = skillExpr;
    return;
  }

  if (hasTitle && !hasDescription && !hasSkills) {
    // Use searchExpression_eq for title searches: titleExpression_eq can't OR
    // multiple keywords (returns 0 results), while searchExpression_eq does.
    filter.searchExpression_eq = titleOrSearchExpr;
    return;
  }

  if (!hasTitle && hasDescription && !hasSkills) {
    filter.searchExpression_eq = titleOrSearchExpr;
    return;
  }

  if (hasTitle && hasDescription && !hasSkills) {
    filter.searchExpression_eq = titleOrSearchExpr;
    return;
  }

  if (hasTitle && !hasDescription && hasSkills) {
    // Title uses searchExpression_eq (titleExpression_eq can't OR keywords).
    filter.searchExpression_eq = titleOrSearchExpr;
    filter.skillExpression_eq = skillExpr;
    return;
  }

  if (
    (!hasTitle && hasDescription && hasSkills) ||
    (hasTitle && hasDescription && hasSkills)
  ) {
    filter.searchExpression_eq = titleOrSearchExpr;
    filter.skillExpression_eq = skillExpr;
  }
}

/**
 * Maps FilterCriteria to Upwork's MarketplaceJobPostingsSearchFilter format.
 * Field names verified against the live Upwork GraphQL schema via introspection.
 *
 * @param criteria - Filter criteria from saved filter
 * @param keywordOverride - When provided, search only this one keyword instead
 *   of combining all terms. Used by callers that still fan out one Upwork
 *   request per keyword (e.g. fetchUpworkFeedForCriteria's multi-keyword path).
 *   When omitted, all of `criteria.keywords.terms` are combined into a single
 *   OR expression so multi-keyword filters resolve in one API request.
 */
export function buildUpworkFilter(
  criteria: FilterCriteria,
  keywordOverride?: string,
): UpworkJobFilter {
  const filter: UpworkJobFilter = {};

  // ── Keywords ──
  const terms = criteria.keywords?.terms ?? [];
  const keywordTerms = keywordOverride ? [keywordOverride] : terms;
  if (keywordTerms.length > 0) {
    const searchIn = criteria.keywords?.search_in ?? ["title"];
    const hasTitle = searchIn.includes("title");
    const hasDescription = searchIn.includes("description");
    const hasSkills = searchIn.includes("skills");

    if (hasTitle || hasDescription || hasSkills) {
      applyKeywordSearchFields(
        filter,
        { hasTitle, hasDescription, hasSkills },
        keywordTerms,
      );
    }
  }

  // ── Job type: Hourly vs Fixed ──
  const hourlyEnabled = criteria.job_terms?.hourly_rate?.enabled;
  const fixedEnabled = criteria.job_terms?.fixed_price?.enabled;

  if (hourlyEnabled && !fixedEnabled) {
    filter.jobType_eq = "HOURLY";
  } else if (fixedEnabled && !hourlyEnabled) {
    filter.jobType_eq = "FIXED";
  }
  // If both enabled or neither, don't set jobType_eq (return both types)

  // ── Hourly rate range ──
  if (hourlyEnabled) {
    const range: { rangeStart?: number; rangeEnd?: number } = {};
    if (criteria.job_terms!.hourly_rate!.from != null) {
      range.rangeStart = criteria.job_terms!.hourly_rate!.from;
    }
    if (criteria.job_terms!.hourly_rate!.to != null) {
      range.rangeEnd = criteria.job_terms!.hourly_rate!.to;
    }
    if (range.rangeStart != null || range.rangeEnd != null) {
      filter.hourlyRate_eq = range;
    }
  }

  // ── Fixed price budget range ──
  if (fixedEnabled) {
    const range: { rangeStart?: number; rangeEnd?: number } = {};
    if (criteria.job_terms!.fixed_price!.from != null) {
      range.rangeStart = criteria.job_terms!.fixed_price!.from;
    }
    if (criteria.job_terms!.fixed_price!.to != null) {
      range.rangeEnd = criteria.job_terms!.fixed_price!.to;
    }
    if (range.rangeStart != null || range.rangeEnd != null) {
      filter.budgetRange_eq = range;
    }
  }

  // ── Applicant count (competition) ──
  // `proposalRange_eq` constrains by how many freelancers have applied. It was
  // previously fed from `required_connects`, which is a different quantity —
  // the connects a freelancer spends to bid. Connects has no API filter at all.
  const applicants = criteria.job_terms?.applicants;
  if (hasActiveApplicantRange(applicants?.min, applicants?.max)) {
    const range: { rangeStart?: number; rangeEnd?: number } = {};
    const min = applicants?.min ?? APPLICANTS_RANGE_MIN;
    const max = applicants?.max ?? APPLICANTS_RANGE_MAX;
    if (min > APPLICANTS_RANGE_MIN) range.rangeStart = min;
    // The top of the slider means "200+", so leave rangeEnd unset to keep
    // heavily-contested jobs in the results.
    if (max < APPLICANTS_RANGE_MAX) range.rangeEnd = max;
    if (range.rangeStart != null || range.rangeEnd != null) {
      filter.proposalRange_eq = range;
    }
  }

  // ── Experience level (single enum value) ──
  const expLevels = (
    criteria.advanced_job_preferences?.experience_level ?? []
  )
    .map((v) => EXPERIENCE_MAP[v])
    .filter(Boolean);
  if (expLevels.length === 1) {
    // API only supports a single value
    filter.experienceLevel_eq = expLevels[0];
  }
  // If multiple experience levels selected, we can't filter by all at API level
  // (API only accepts a single enum). We'd need multiple queries or skip the filter.

  // ── Hours per week (workload) ──
  // EngagementType: FULL_TIME | PART_TIME | AS_NEEDED | NOT_SURE
  // less_than_30 ≈ PART_TIME, more_than_30 ≈ FULL_TIME
  const hoursPerWeek = criteria.advanced_job_preferences?.hours_per_week ?? [];
  if (hoursPerWeek.length === 1) {
    if (hoursPerWeek[0] === "less_than_30") {
      filter.workload_eq = "PART_TIME";
    } else if (hoursPerWeek[0] === "more_than_30") {
      filter.workload_eq = "FULL_TIME";
    }
  }
  // If both selected or neither, don't set workload_eq (return all)

  // ── Client details ──
  if (
    criteria.client_details?.hires_min != null &&
    criteria.client_details.hires_min > 0
  ) {
    filter.clientHiresRange_eq = {
      rangeStart: criteria.client_details.hires_min,
    };
  }

  if (criteria.client_details?.payment_verified) {
    filter.verifiedPaymentOnly_eq = true;
  }

  if (criteria.client_details?.enterprise_client) {
    filter.enterpriseOnly_eq = true;
  }

  // Client location preferences
  if (
    criteria.client_details?.preferred_locations &&
    criteria.client_details.preferred_locations.length > 0
  ) {
    filter.locations_any = criteria.client_details.preferred_locations;
  }

  // Note: total_spend_min is NOT available as an API filter field.
  // It can only be enforced via client-side post-filtering if needed.

  return filter;
}
