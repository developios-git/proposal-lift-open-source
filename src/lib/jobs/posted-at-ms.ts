/**
 * Upwork returns datetimes like `2026-04-03T11:11:54+0000` (offset without `:`).
 * `Date.parse` / `new Date` are unreliable for that form in some engines, yielding NaN
 * and breaking sort (stable order preserves per-filter blocks).
 */

/** Insert `:` in trailing ±HHMM offset so ISO parsing is consistent. */
export function normalizeIso8601Offset(iso: string): string {
  return iso.replace(/([+-])(\d{2})(\d{2})$/, "$1$2:$3");
}

/**
 * Milliseconds since epoch for sorting, or `Number.NEGATIVE_INFINITY` when missing/invalid
 * (sort those last when using descending newest-first).
 */
export function postedAtMsForSort(posted_at: string | null | undefined): number {
  if (posted_at == null || posted_at === "") return Number.NEGATIVE_INFINITY;
  const t = Date.parse(normalizeIso8601Offset(posted_at.trim()));
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}
