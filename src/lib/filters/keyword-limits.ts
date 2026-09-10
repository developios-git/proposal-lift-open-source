/** Shared keyword limits for saved job filters. Server is authoritative; the UI mirrors these. */

/**
 * Max include keywords (`keywords.terms`) per filter.
 *
 * Include terms are joined with ` OR ` into a single Upwork Lucene
 * `searchExpression_eq` (see `src/lib/upwork/filter-mapper.ts`), so an unbounded
 * list both degrades result quality and inflates API spend. Exclude terms are
 * applied locally after the fetch and are deliberately uncapped.
 *
 * Existing filters over this limit keep their keywords: the cap blocks growth,
 * it never truncates. See the PATCH handler in `src/app/api/filters/[id]/route.ts`.
 */
export const MAX_FILTER_KEYWORD_TERMS = 5;

/**
 * Max characters in a single keyword, include or exclude.
 *
 * Each include term is quoted and OR'd into one Lucene `searchExpression_eq`
 * (see `src/lib/upwork/filter-mapper.ts`), so it is matched as a phrase. A term
 * long enough to be a sentence phrase-matches nothing and fails silently — zero
 * jobs, no error to explain why. Unlike the count cap this also covers exclude
 * terms: they cost no Upwork spend, but they are just as unusable at 200
 * characters, and they share the same input control.
 */
export const MAX_KEYWORD_LENGTH = 30;

/**
 * Number of include keywords in a saved filter's criteria.
 *
 * `saved_job_filters.filters` is unvalidated jsonb and the routes only check
 * `typeof filters === "object"` — which `null` and arrays both pass — so every
 * level is probed before use. Anything that isn't an array at `keywords.terms`
 * counts as 0.
 */
export function countKeywordTerms(filters: unknown): number {
  if (typeof filters !== "object" || filters === null) return 0;
  const { keywords } = filters as { keywords?: unknown };
  if (typeof keywords !== "object" || keywords === null) return 0;
  const { terms } = keywords as { terms?: unknown };
  return Array.isArray(terms) ? terms.length : 0;
}

/**
 * Whether a filter update should be rejected for having too many include keywords.
 *
 * The cap blocks growth rather than enforcing a flat ceiling: a filter saved
 * before the cap existed keeps its keywords and stays fully editable — it can be
 * renamed, re-scoped, and saved — it simply cannot gain another keyword. Passing
 * a nullish `existing` (a create, or a row that could not be read) makes this a
 * plain ceiling, since any count above the cap is also above zero.
 */
export function exceedsKeywordLimit(next: unknown, existing: unknown): boolean {
  const nextCount = countKeywordTerms(next);
  return (
    nextCount > MAX_FILTER_KEYWORD_TERMS &&
    nextCount > countKeywordTerms(existing)
  );
}

/**
 * Every keyword string in a filter, include and exclude alike.
 *
 * Non-strings are skipped rather than counted: `filters` is unvalidated jsonb,
 * and a number or object sitting at that position has no length to cap. This is
 * the opposite call from `countKeywordTerms`, which counts them so a junk blob
 * cannot smuggle in extra slots.
 */
function keywordStrings(filters: unknown): string[] {
  if (typeof filters !== "object" || filters === null) return [];
  const { keywords } = filters as { keywords?: unknown };
  if (typeof keywords !== "object" || keywords === null) return [];
  const { terms, exclude_terms: excludeTerms } = keywords as {
    terms?: unknown;
    exclude_terms?: unknown;
  };
  return [terms, excludeTerms]
    .flatMap((list) => (Array.isArray(list) ? list : []))
    .filter((term): term is string => typeof term === "string");
}

/**
 * Whether a filter update introduces a keyword longer than the cap.
 *
 * Blocks growth rather than enforcing a flat ceiling, matching
 * `exceedsKeywordLimit`: a term already stored keeps its length and the filter
 * stays fully editable, so an over-length keyword saved before the cap can
 * still be renamed around, re-scoped, and saved — it just cannot be joined by a
 * new one. Length is measured after trimming, since that is what the routes
 * store and what filter-mapper quotes into the expression.
 */
export function exceedsKeywordLength(next: unknown, existing: unknown): boolean {
  const stored = new Set(keywordStrings(existing));
  return keywordStrings(next).some(
    (term) => !stored.has(term) && term.trim().length > MAX_KEYWORD_LENGTH,
  );
}
