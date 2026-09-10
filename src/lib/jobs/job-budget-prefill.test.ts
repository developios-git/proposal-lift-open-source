import { describe, expect, it } from "vitest";
import { jobBudgetPrefill } from "./job-budget-prefill";

describe("jobBudgetPrefill", () => {
  it("carries an hourly rate as hourly, not as a project budget", () => {
    // The regression: budget_min/max are null on hourly jobs, so the old
    // fixed-only read produced nothing at all.
    expect(
      jobBudgetPrefill({
        job_type: "hourly",
        budget_min: null,
        budget_max: null,
        hourly_rate_min: 20,
        hourly_rate_max: 25,
      }),
    ).toEqual({ budget: "25", budgetKind: "hourly" });
  });

  it("uses the hourly minimum when no maximum is quoted", () => {
    expect(
      jobBudgetPrefill({
        job_type: "hourly",
        hourly_rate_min: 30,
        hourly_rate_max: null,
      }),
    ).toEqual({ budget: "30", budgetKind: "hourly" });
  });

  it("carries a fixed budget as fixed", () => {
    expect(
      jobBudgetPrefill({
        job_type: "fixed",
        budget_min: 12000,
        budget_max: 12000,
      }),
    ).toEqual({ budget: "12000", budgetKind: "fixed" });
  });

  it("infers hourly from the rates when job_type is missing", () => {
    expect(
      jobBudgetPrefill({ hourly_rate_max: 45, budget_max: null }),
    ).toEqual({ budget: "45", budgetKind: "hourly" });
  });

  it("reports none when the job quotes no pay at all", () => {
    expect(jobBudgetPrefill({ job_type: "fixed" })).toEqual({
      budgetKind: "none",
    });
    expect(jobBudgetPrefill({})).toEqual({ budgetKind: "none" });
  });

  it("treats a zero budget as a real figure, not a missing one", () => {
    expect(jobBudgetPrefill({ job_type: "fixed", budget_max: 0 })).toEqual({
      budget: "0",
      budgetKind: "fixed",
    });
  });
});
