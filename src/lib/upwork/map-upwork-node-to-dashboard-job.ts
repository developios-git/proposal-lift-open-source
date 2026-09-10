/**
 * Map Upwork GraphQL marketplace job node → Job Feed dashboard shape.
 * Aligns with src/app/(filter-page)/filter/[id]/page.tsx mapUpworkJobToDisplayJob (url vs ciphertext).
 */

import { computeClientHireRate } from "@/lib/jobs/client-hire-rate";
import { normalizeIso8601Offset } from "@/lib/jobs/posted-at-ms";

export interface DashboardFeedJob {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  category: string | null;
  skills: string[];
  experience_level: string | null;
  job_type: string | null;
  budget_min: number | null;
  budget_max: number | null;
  hourly_rate_min: number | null;
  hourly_rate_max: number | null;
  duration: string | null;
  client_country: string | null;
  client_city: string | null;
  client_total_spent: number | null;
  /** Derived from hires ÷ posted jobs; Upwork returns no such field. */
  client_hire_rate: number | null;
  client_total_hires: number | null;
  client_total_posted_jobs: number | null;
  client_total_reviews: number | null;
  client_payment_verified: boolean;
  /** Upwork's `hasFinancialPrivacy` — explains a null `client_total_spent`. */
  has_financial_privacy: boolean | null;
  client_avg_rating: number | null;
  client_member_since: string | null;
  /** What the client last hired for. Unrelated to this posting. */
  client_last_contract_title: string | null;
  /** Set only when the client re-posted the listing. Drives the "Renewed" badge. */
  renewed_at: string | null;
  proposals_count: number | null;
  posted_at: string | null;
  connects_required: number | null;
  fit_score: number | null;
  fit_reasons: string[] | null;
  ai_summary: string | null;
  status: string;
  notes: string | null;
  /** Upwork's `applied` flag for the connected account. */
  already_applied: boolean;
}

function normalizeExperience(level: string | null | undefined): string | null {
  if (!level) return null;
  const lower = level.toLowerCase();
  if (lower.includes("entry")) return "entry";
  if (lower.includes("inter")) return "intermediate";
  if (lower.includes("expert")) return "expert";
  return level;
}

export function mapUpworkNodeToDashboardJob(raw: Record<string, unknown>): DashboardFeedJob {
  const id = String(raw.id ?? "");
  const title = String(raw.title ?? "");
  const ciphertext = raw.ciphertext != null ? String(raw.ciphertext) : null;
  const description =
    raw.description != null ? String(raw.description) : null;

  const hourlyMinRaw = raw.hourlyBudgetMin as Record<string, unknown> | undefined;
  const hourlyMaxRaw = raw.hourlyBudgetMax as Record<string, unknown> | undefined;
  const hourlyMin =
    hourlyMinRaw?.rawValue != null
      ? parseFloat(String(hourlyMinRaw.rawValue))
      : null;
  const hourlyMax =
    hourlyMaxRaw?.rawValue != null
      ? parseFloat(String(hourlyMaxRaw.rawValue))
      : null;

  const engagementLower = String(raw.engagement ?? "").toLowerCase();
  const hasHourlyBudget = hourlyMin != null || hourlyMax != null;
  const isHourly =
    hasHourlyBudget ||
    engagementLower.includes("hour") ||
    engagementLower.includes("hr");

  const amount = raw.amount as Record<string, unknown> | undefined;
  const amountVal =
    amount?.rawValue != null ? parseFloat(String(amount.rawValue)) : null;

  const skillsRaw = raw.skills as Array<{ name?: string; prettyName?: string }> | undefined;
  const skills =
    skillsRaw?.map((s) => s.prettyName || s.name || "").filter(Boolean) ?? [];

  const client = raw.client as Record<string, unknown> | undefined;
  const totalSpent = client?.totalSpent as Record<string, unknown> | undefined;
  const clientTotalSpent =
    totalSpent?.rawValue != null
      ? parseFloat(String(totalSpent.rawValue))
      : null;
  const clientTotalHires =
    client?.totalHires != null ? Number(client.totalHires) : null;
  const clientTotalPostedJobs =
    client?.totalPostedJobs != null ? Number(client.totalPostedJobs) : null;

  const url = ciphertext
    ? `https://www.upwork.com/jobs/${title.replace(/[ /]/g, "-")}_${ciphertext}/?referrer_url_path=/nx/search/jobs/`
    : `https://www.upwork.com/jobs/~${id.replace(/^~/, "")}`;

  return {
    id,
    title,
    description,
    url,
    category: raw.category != null ? String(raw.category) : null,
    skills,
    experience_level: normalizeExperience(
      raw.experienceLevel != null ? String(raw.experienceLevel) : null,
    ),
    job_type: isHourly ? "hourly" : amountVal != null ? "fixed" : null,
    budget_min: !isHourly ? amountVal : null,
    budget_max: !isHourly ? amountVal : null,
    hourly_rate_min: isHourly ? hourlyMin : null,
    hourly_rate_max: isHourly ? hourlyMax : null,
    duration:
      raw.durationLabel != null
        ? String(raw.durationLabel)
        : raw.duration != null
          ? String(raw.duration)
          : null,
    client_country: (client?.location as Record<string, unknown> | undefined)
      ?.country as string | null,
    client_city: (client?.location as Record<string, unknown> | undefined)
      ?.city as string | null,
    client_total_spent: clientTotalSpent,
    client_hire_rate: computeClientHireRate(clientTotalHires, clientTotalPostedJobs),
    client_total_hires: clientTotalHires,
    client_total_posted_jobs: clientTotalPostedJobs,
    client_total_reviews:
      client?.totalReviews != null ? Number(client.totalReviews) : null,
    client_payment_verified:
      String(client?.verificationStatus ?? "") === "VERIFIED",
    // Absent means "not hidden", not "unknown" — the field is non-null in
    // Upwork's schema, so only a stripped payload leaves it undefined.
    has_financial_privacy:
      client?.hasFinancialPrivacy != null
        ? client.hasFinancialPrivacy === true
        : null,
    // `totalFeedback` is Upwork's name for the average star rating.
    client_avg_rating:
      client?.totalFeedback != null
        ? parseFloat(String(client.totalFeedback))
        : null,
    client_member_since:
      client?.memberSinceDateTime != null
        ? String(client.memberSinceDateTime)
        : null,
    client_last_contract_title:
      client?.lastContractTitle != null
        ? String(client.lastContractTitle)
        : null,
    renewed_at:
      raw.renewedDateTime != null
        ? normalizeIso8601Offset(String(raw.renewedDateTime))
        : null,
    // Upwork's `totalApplicants` is the number of freelancers who have applied,
    // which is what the UI labels "proposals".
    proposals_count:
      raw.totalApplicants != null ? Number(raw.totalApplicants) : null,
    posted_at:
      raw.createdDateTime != null
        ? normalizeIso8601Offset(String(raw.createdDateTime))
        : null,
    connects_required: null,
    fit_score: null,
    fit_reasons: null,
    ai_summary: null,
    status: "new",
    notes: null,
    already_applied: raw.applied === true,
  };
}
