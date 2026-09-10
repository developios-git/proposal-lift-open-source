/**
 * Pick the budget figure to carry from a job feed into the proposal form.
 *
 * `map-upwork-node-to-dashboard-job` splits the two kinds of pay apart on
 * purpose: a fixed-price job fills `budget_min`/`budget_max` and leaves the
 * hourly pair null, an hourly job does the reverse. Both prefill call sites
 * read only the fixed pair, so every hourly job arrived at
 * `/proposals/new` with an empty Budget field.
 *
 * Copying the hourly rate into a field labelled "Budget ($)" would have been
 * worse than leaving it blank — "25" there reads as a $25 project, and that
 * number is sent verbatim to the model. So the kind travels with the figure
 * and the form relabels itself, which is the only way one field can honestly
 * hold both.
 */

export type JobBudgetSource = {
  job_type?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  hourly_rate_min?: number | null;
  hourly_rate_max?: number | null;
};

/** How to read the accompanying figure; "none" when the job quotes no pay. */
export type BudgetKind = "fixed" | "hourly" | "none";

export type JobBudgetPrefill = {
  budget?: string;
  budgetKind: BudgetKind;
};

/** The top of a range is the useful end: it is what the client will pay. */
function firstNumber(...values: (number | null | undefined)[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

export function jobBudgetPrefill(job: JobBudgetSource): JobBudgetPrefill {
  const hourly = firstNumber(job.hourly_rate_max, job.hourly_rate_min);
  const fixed = firstNumber(job.budget_max, job.budget_min);

  // Trust `job_type` when it is set, but do not require it: jobs reaching this
  // from other feeds carry the rates without the label.
  const isHourly = job.job_type === "hourly" || (hourly != null && fixed == null);

  if (isHourly && hourly != null) {
    return { budget: String(hourly), budgetKind: "hourly" };
  }
  if (fixed != null) {
    return { budget: String(fixed), budgetKind: "fixed" };
  }
  return { budgetKind: "none" };
}
