/**
 * What an inline filter-name edit should do when it is committed (Enter or blur).
 *
 * Kept pure and separate from the filter page so the three rules stay testable —
 * the page component that consumes it is far too large to test directly, and
 * vitest here only collects `src/**\/*.test.ts` anyway.
 *
 * An empty draft reverts rather than saving. The API would coerce a blank name to
 * "Untitled" (see /api/filters/[id]), but silently renaming someone's filter
 * because they selected all and tabbed away is worse than doing nothing.
 */
export type NameCommit =
  | { action: "none"; name: string }
  | { action: "revert"; name: string }
  | { action: "save"; name: string };

export function resolveNameCommit(draft: string, current: string): NameCommit {
  const trimmed = draft.trim();
  if (!trimmed) return { action: "revert", name: current };
  if (trimmed === current) return { action: "none", name: current };
  return { action: "save", name: trimmed };
}
