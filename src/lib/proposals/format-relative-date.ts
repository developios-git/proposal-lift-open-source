/**
 * "Today" / "Yesterday" / "N days ago" for a proposal's timestamp.
 *
 * This lived inline in the proposals table and was wrong in a way nobody
 * noticed because it always erred in the same direction: it measured *elapsed
 * milliseconds* and rounded up with `Math.ceil`, so anything younger than 24
 * hours produced 1 and read "Yesterday". A proposal saved two minutes earlier
 * was labelled a day old, and the `=== 0` branch for "Today" could only ever
 * be reached by a timestamp equal to the current instant.
 *
 * Elapsed time was the wrong measure regardless of rounding. "Yesterday" is a
 * calendar word: something saved at 23:50 becomes yesterday twenty minutes
 * later, not after a full day. So compare local midnights instead, which also
 * puts the boundary where the person reading it expects.
 */

const DAY_MS = 86_400_000;

/** Local midnight for a date, in the viewer's own timezone. */
function startOfLocalDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/**
 * @param dateString an ISO timestamp, or null for a missing value
 * @param now injectable for tests; defaults to the current instant
 */
export function formatRelativeDate(
  dateString: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!dateString) return "-";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";

  // Rounding matters here: a DST transition makes the local day 23 or 25 hours
  // long, so the quotient lands on 0.958 or 1.042 rather than a whole number.
  const diffDays = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(date)) / DAY_MS,
  );

  // A timestamp in the future is clock skew between the browser and Postgres,
  // not a real event. Call it today rather than "-1 days ago".
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString();
}
