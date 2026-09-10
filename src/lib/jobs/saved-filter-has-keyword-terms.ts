import type { FilterCriteria } from "@/types";

/** Saved filters without keyword terms do not drive Upwork search expressions. */
export function savedFilterHasKeywordTerms(filters: unknown): boolean {
  const f = filters as FilterCriteria | null | undefined;
  const terms = f?.keywords?.terms ?? [];
  return terms.some((t) => String(t).trim().length > 0);
}
