import {
  QUALIFY_JOB_DESCRIPTION_MAX_LENGTH,
  QUALIFY_REASON_MAX_LENGTH,
} from "./constants";
import type { QualifyJobInput } from "./types";

/**
 * System prompt for POST /api/jobs/qualify.
 *
 * Rule 2 is the load-bearing one. Without it the model applies its own notion of
 * a good job — rejecting low budgets, unverified clients, vague scopes — and
 * disqualifies broadly regardless of what the freelancer actually asked for,
 * which reads to the user as the feature being broken.
 */
export function buildQualifySystemPrompt(criteria: string): string {
  return `You are a job qualification assistant for a freelancer on Upwork. You decide whether a single job posting is worth this freelancer's time, judged only against criteria they wrote themselves.

Respond ONLY with valid JSON matching this exact schema:
{
  "verdict": "qualified" | "disqualified",
  "reason": "One sentence, maximum ${QUALIFY_REASON_MAX_LENGTH} characters, explaining the verdict in plain language.",
  "unverifiable": ["Each stated criterion you could not check, quoted or closely paraphrased from the freelancer's own wording. Empty array if you checked them all."]
}

RULES

1. Judge the job ONLY against the freelancer's criteria below. Do not apply your own standards for what makes a good job, a fair rate, or a trustworthy client.
2. Silence is not disqualification. If the criteria say nothing about a dimension — budget, client history, duration, workload, location — that dimension cannot disqualify the job.
3. Return "disqualified" when the criteria state a condition and the job clearly violates it.
4. If a stated condition cannot be evaluated because the job data omits that field, do not disqualify on that basis alone. Decide on the conditions you can actually check, and list every skipped condition in "unverifiable".
5. "unverifiable" must be honest and complete. Never omit a condition you skipped, and never list one you actually evaluated. A freelancer relying on a rule you quietly ignored is worse than a wrong verdict, because it is invisible.
6. Weigh substance over keyword presence. A posting that mentions a technology once in passing is not work in that technology.
7. The reason must name the specific criterion that decided the verdict. For "disqualified", name what failed and why. For "qualified", name what matched. Never write a generic reason such as "this job matches your criteria".
8. "Client rating: no reviews yet" means the client has never been rated. It does NOT mean a rating of zero — do not treat it as a bad rating.
9. Output nothing outside the JSON object. No markdown code fences, no preamble, no trailing commentary.

FREELANCER'S CRITERIA
${criteria.trim()}`;
}

/** Renders the job's pay as a single line, or null when the posting states none. */
function formatBudget(job: QualifyJobInput): string | null {
  const { hourly_rate_min: hMin, hourly_rate_max: hMax } = job;
  if (hMin != null && hMax != null) return `$${hMin}-$${hMax} per hour`;
  if (hMax != null) return `$${hMax} per hour`;
  if (hMin != null) return `$${hMin} per hour`;

  const { budget_min: bMin, budget_max: bMax } = job;
  if (bMin != null && bMax != null) {
    return bMin === bMax
      ? `$${bMin.toLocaleString("en-US")} fixed`
      : `$${bMin.toLocaleString("en-US")}-$${bMax.toLocaleString("en-US")} fixed`;
  }
  const single = bMax ?? bMin;
  if (single != null) return `$${single.toLocaleString("en-US")} fixed`;

  return null;
}

/** "web_mobile_software_dev" → "Web Mobile Software Dev" */
function humanizeCategory(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Client facts, in a fixed order so the model sees a consistent shape.
 *
 * Rating is the subtle one: Upwork reports `totalFeedback: 0` for a client who
 * has simply never been rated. Passing "0" through would read as an appalling
 * client, so a zero-review client is described in words instead.
 */
function buildClientLines(job: QualifyJobInput): string[] {
  const lines: string[] = [];

  if (job.client_country) lines.push(`Client country: ${job.client_country}`);

  if (job.client_payment_verified != null) {
    lines.push(
      `Client payment verified: ${job.client_payment_verified ? "yes" : "no"}`,
    );
  }

  if (job.client_total_spent != null) {
    lines.push(
      `Client total spend: $${job.client_total_spent.toLocaleString("en-US")}`,
    );
  }

  const hires = job.client_total_hires;
  const posted = job.client_total_posted_jobs;
  if (hires != null && posted != null) {
    lines.push(
      `Client hires: ${hires} across ${posted} job${posted === 1 ? "" : "s"} posted`,
    );
  } else if (hires != null) {
    lines.push(`Client hires: ${hires}`);
  } else if (posted != null) {
    lines.push(`Client jobs posted: ${posted}`);
  }

  const reviews = job.client_total_reviews;
  const rating = job.client_avg_rating;
  if (reviews != null && reviews > 0) {
    lines.push(
      rating != null && rating > 0
        ? `Client rating: ${rating.toFixed(1)} out of 5 from ${reviews} review${reviews === 1 ? "" : "s"}`
        : `Client reviews: ${reviews} (no rating score available)`,
    );
  } else if (reviews != null) {
    lines.push("Client rating: no reviews yet");
  }

  return lines;
}

/**
 * Builds the user message. Absent fields are omitted entirely rather than
 * rendered as "unknown", so the model is not invited to reason about data the
 * posting never provided.
 */
export function buildQualifyUserPrompt(job: QualifyJobInput): string {
  const lines: string[] = ["Evaluate this Upwork job posting.", ""];

  lines.push(`Title: ${job.title}`);

  const budget = formatBudget(job);
  lines.push(`Budget: ${budget ?? "Not specified"}`);

  if (job.posted_age) lines.push(`Posted: ${job.posted_age}`);
  if (job.experience_level) lines.push(`Experience level: ${job.experience_level}`);
  if (job.duration) lines.push(`Duration: ${job.duration}`);
  if (job.workload) lines.push(`Workload: ${job.workload}`);

  const categories = [job.category, job.subcategory]
    .filter((c): c is string => Boolean(c))
    .map(humanizeCategory);
  if (categories.length > 0) lines.push(`Category: ${categories.join(" / ")}`);

  const skills = (job.skills ?? []).filter(Boolean);
  if (skills.length > 0) lines.push(`Skills: ${skills.join(", ")}`);

  if (job.total_applicants != null) {
    lines.push(`Applicants so far: ${job.total_applicants}`);
  }

  lines.push(...buildClientLines(job));

  const description = (job.description ?? "").trim();
  if (description) {
    const truncated =
      description.length > QUALIFY_JOB_DESCRIPTION_MAX_LENGTH
        ? `${description.slice(0, QUALIFY_JOB_DESCRIPTION_MAX_LENGTH)}\n[truncated]`
        : description;
    lines.push("", "Description:", '"""', truncated, '"""');
  }

  return lines.join("\n");
}
