import { jobMatchesCountryFilters } from "@/lib/country-filter";
import {
  computeClientHireRate,
  jobMatchesHireRateMin,
} from "@/lib/jobs/client-hire-rate";
import {
  hasActiveFreelancerLocationFilter,
  jobMatchesFreelancerLocationFilters,
} from "@/lib/jobs/freelancer-location-filter";
import type { UpworkJob } from "@/lib/upwork/client";
import type { FilterCriteria } from "@/types";

function parseDurationToProjectLength(duration: string | null | undefined): string | null {
  if (!duration || typeof duration !== "string") return null;
  const d = duration.toLowerCase().trim();
  if (d.includes("more than 6") || d.includes("6+") || d.includes("> 6"))
    return "more_than_6_months";
  if (d.includes("3 to 6") || d.includes("3-6") || d.includes("3–6") || d.includes("3 and 6"))
    return "3_to_6_months";
  if (d.includes("1 to 3") || d.includes("1-3") || d.includes("1–3") || d.includes("1 and 3"))
    return "1_to_3_months";
  if (
    d.includes("less than 1") ||
    d.includes("less than a month") ||
    d.includes("< 1") ||
    d.includes("<1") ||
    (d.includes("less than") && d.includes("month"))
  )
    return "less_than_month";
  return null;
}

function normalizeExperienceLevel(level: string | null | undefined): string | null {
  if (!level || typeof level !== "string") return null;
  const l = level.toLowerCase();
  if (l.includes("entry") || l.includes("beginner")) return "entry";
  if (l.includes("intermediate") || l.includes("inter")) return "intermediate";
  if (l.includes("expert") || l.includes("senior")) return "expert";
  return null;
}

/**
 * Hire-rate-only pass over raw Upwork nodes.
 *
 * `/api/jobs/sync` returns raw jobs and the /filter/[id] page post-filters the
 * rest in the browser. Hire rate is decided on the server instead, so this
 * narrow pass exists rather than calling the full `applyFrontendFilters` there
 * — that would silently move every other post-filter server-side too.
 *
 * Applied to the response only, never before a snapshot write: caching narrowed
 * jobs would leave a shared-mode feed unable to widen again when the minimum is
 * lowered.
 */
export function applyHireRateFilter(
  jobs: UpworkJob[],
  criteria: FilterCriteria,
): UpworkJob[] {
  const minRate = criteria.client_details?.hire_rate_min ?? 0;
  if (minRate <= 0) return jobs;
  return jobs.filter((job) =>
    jobMatchesHireRateMin(
      computeClientHireRate(job.client?.totalHires, job.client?.totalPostedJobs),
      minRate,
    ),
  );
}

/**
 * Applies the same client-side filters the frontend filteredJobs useMemo uses,
 * but operating on raw UpworkJob objects returned by the API rather than
 * mapped DB Job objects. This ensures webhook notifications match exactly
 * what the user sees on the filter page.
 */
export function applyFrontendFilters(jobs: UpworkJob[], criteria: FilterCriteria): UpworkJob[] {
  const cd = criteria.client_details;
  const jt = criteria.job_terms;
  const ajp = criteria.advanced_job_preferences;

  const needsClientFilter =
    cd &&
    ((cd.total_spend_min ?? 0) > 0 ||
      (cd.rating_min ?? 0) > 0 ||
      (cd.reviews_count_min ?? 0) > 0 ||
      (cd.hire_rate_min ?? 0) > 0 ||
      !cd.include_without_history ||
      (cd.avoid_locations?.length ?? 0) > 0);
  const needsBudgetFilter = jt?.hide_without_budget;
  const needsCountryFilter =
    (cd?.include_countries?.length ?? 0) > 0 || (cd?.exclude_countries?.length ?? 0) > 0;
  const projectLengths = ajp?.project_length ?? [];
  const expLevels = ajp?.experience_level ?? [];
  const hoursPerWeek = ajp?.hours_per_week ?? [];
  const needsProjectLengthFilter = projectLengths.length > 0;
  const needsExpLevelFilter = expLevels.length > 1; // API handles single; multi needs client-side
  const needsHoursFilter = hoursPerWeek.length >= 1;
  const needsAdvancedFilter = needsProjectLengthFilter || needsExpLevelFilter || needsHoursFilter;
  const fl = criteria.freelancer_location;
  const needsFreelancerLocationFilter = hasActiveFreelancerLocationFilter(fl);

  if (
    !needsClientFilter &&
    !needsBudgetFilter &&
    !needsAdvancedFilter &&
    !needsCountryFilter &&
    !needsFreelancerLocationFilter
  ) {
    return jobs;
  }

  return jobs.filter((job) => {
    const raw = job as unknown as Record<string, unknown>;

    // hourlyBudgetMin/Max are not in the typed interface but are returned by the GraphQL API
    const hourlyMinRaw = (raw.hourlyBudgetMin as Record<string, unknown> | undefined)?.rawValue;
    const amountRaw = (raw.amount as Record<string, unknown> | undefined)?.rawValue;

    const clientRaw = raw.client as Record<string, unknown> | null | undefined;
    /** Upwork's name for the client's average star rating. */
    const totalFeedback = job.client?.totalFeedback ?? null;
    // totalSpent is a Money type — the API returns { rawValue, currency }, not { value, currency }
    const totalSpentRaw = (clientRaw?.totalSpent as Record<string, unknown> | null | undefined)
      ?.rawValue;
    const totalSpent = totalSpentRaw != null ? parseFloat(String(totalSpentRaw)) : null;
    const totalReviews = job.client?.totalReviews ?? null;
    const totalHires = job.client?.totalHires ?? null;
    const totalPostedJobs = job.client?.totalPostedJobs ?? null;

    // 0. Preferred freelancer location (no API-side equivalent)
    if (
      needsFreelancerLocationFilter &&
      !jobMatchesFreelancerLocationFilters(job.preferredFreelancerLocation, fl)
    ) {
      return false;
    }

    // 1. Hide without budget
    if (needsBudgetFilter && hourlyMinRaw == null && amountRaw == null) return false;

    // 2. Client history + metrics
    if (cd && needsClientFilter) {
      const hasHistory = totalSpent != null || totalHires != null || totalReviews != null;

      if (!cd.include_without_history && !hasHistory) return false;

      if (hasHistory) {
        if ((cd.total_spend_min ?? 0) > 0 && (totalSpent ?? 0) < cd.total_spend_min!)
          return false;
        if ((cd.rating_min ?? 0) > 0 && (totalFeedback ?? 0) < cd.rating_min!) return false;
        if ((cd.reviews_count_min ?? 0) > 0 && (totalReviews ?? 0) < cd.reviews_count_min!)
          return false;
      }

      // Hire rate is derived (hires ÷ posted jobs), so it sits outside the
      // hasHistory gate — jobMatchesHireRateMin already keeps jobs whose rate
      // Upwork gave us no numbers for.
      if (
        !jobMatchesHireRateMin(
          computeClientHireRate(totalHires, totalPostedJobs),
          cd.hire_rate_min,
        )
      )
        return false;

      if ((cd.avoid_locations?.length ?? 0) > 0 && job.client?.location?.country) {
        const country = job.client.location.country;
        if (
          cd.avoid_locations!.some((loc) => country.toLowerCase().includes(loc.toLowerCase()))
        )
          return false;
      }
    }

    // 3. Country include/exclude (canonical matching via shared utility)
    if (needsCountryFilter) {
      if (
        !jobMatchesCountryFilters(
          job.client?.location?.country,
          cd?.include_countries ?? [],
          cd?.exclude_countries ?? [],
        )
      )
        return false;
    }

    // 4. Project length
    if (needsProjectLengthFilter) {
      const jobLength = parseDurationToProjectLength(job.duration);
      if (jobLength && !projectLengths.includes(jobLength)) return false;
    }

    // 5. Experience level (multi-value; API only handles single)
    if (needsExpLevelFilter) {
      const jobExp = normalizeExperienceLevel(job.experienceLevel);
      if (jobExp && !expLevels.includes(jobExp)) return false;
    }

    // 6. Hours per week (workload / engagement field)
    if (needsHoursFilter) {
      const w = String(job.engagement ?? "").toLowerCase();
      const isPartTime = w.includes("less than 30") || w.includes("not sure");
      const isFullTime = w.includes("30+");
      const wantsPartTime = hoursPerWeek.includes("less_than_30");
      const wantsFullTime = hoursPerWeek.includes("more_than_30");
      if (wantsPartTime && wantsFullTime) return true; // both selected → include all
      if (!isPartTime && !isFullTime) return false;
      if (wantsPartTime && !isPartTime) return false;
      if (wantsFullTime && !isFullTime) return false;
    }

    return true;
  });
}
