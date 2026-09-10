import type { UpworkJob } from "@/lib/upwork/client";
import type { FilterCriteria } from "@/types";

const EXCLUDE_SURFACE_ALLOWLIST = ["title", "description", "skills"] as const;
export type ExcludeKeywordSurface = (typeof EXCLUDE_SURFACE_ALLOWLIST)[number];

/** Default when key is absent (backward compatible with saved filters). */
export const DEFAULT_EXCLUDE_SEARCH_IN: ExcludeKeywordSurface[] = [
  "title",
  "description",
  "skills",
];

/** Trim and drop empty strings from persisted exclude keyword list. */
export function normalizeExcludeTerms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => String(t).trim())
    .filter((t) => t.length > 0);
}

/**
 * Surfaces used for exclude matching.
 * - `undefined` on criteria: legacy row → use all surfaces.
 * - `[]` or all invalid: user cleared all boxes → exclude filtering disabled (surfaces=null).
 */
export function resolveExcludeSearchIn(
  criteria: FilterCriteria | null | undefined,
): ExcludeKeywordSurface[] | null {
  const raw = criteria?.keywords?.exclude_search_in;
  if (raw === undefined) {
    return [...DEFAULT_EXCLUDE_SEARCH_IN];
  }
  if (!Array.isArray(raw)) {
    return [...DEFAULT_EXCLUDE_SEARCH_IN];
  }
  const allow = new Set<string>(EXCLUDE_SURFACE_ALLOWLIST);
  const filtered = raw.filter((x): x is ExcludeKeywordSurface =>
    allow.has(String(x)),
  );
  return filtered.length > 0 ? filtered : null;
}

/**
 * True if any exclude term appears as a case-insensitive substring in any of
 * the given surfaces on the Upwork job payload.
 */
export function upworkJobMatchesAnyExcludeTerm(
  job: UpworkJob,
  excludeTerms: string[],
  surfaces: ExcludeKeywordSurface[],
): boolean {
  if (excludeTerms.length === 0 || surfaces.length === 0) return false;
  const parts: string[] = [];
  if (surfaces.includes("title")) parts.push(job.title ?? "");
  if (surfaces.includes("description")) parts.push(job.description ?? "");
  if (surfaces.includes("skills")) {
    for (const s of job.skills ?? []) {
      parts.push(s.prettyName || s.name || "");
    }
  }
  const haystack = parts.join(" ").toLowerCase();
  return excludeTerms.some((term) =>
    haystack.includes(term.toLowerCase()),
  );
}

/**
 * Drops jobs that match any exclude keyword on enabled surfaces. No-op when
 * exclude list is empty or user disabled all exclude surfaces.
 */
export function filterUpworkJobsByExcludeTerms(
  jobs: UpworkJob[],
  criteria: FilterCriteria | null | undefined,
): UpworkJob[] {
  const excludeTerms = normalizeExcludeTerms(
    criteria?.keywords?.exclude_terms,
  );
  if (excludeTerms.length === 0) return jobs;

  const surfaces = resolveExcludeSearchIn(criteria);
  if (!surfaces) return jobs;

  return jobs.filter(
    (j) => !upworkJobMatchesAnyExcludeTerm(j, excludeTerms, surfaces),
  );
}
