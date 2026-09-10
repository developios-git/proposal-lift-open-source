"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How long a newly-arrived job row stays tinted. The fade back is a CSS colour
 * transition on the row, so this is the length of the solid highlight only.
 */
export const NEW_JOB_HIGHLIGHT_MS = 15_000;

/**
 * Holds the ids of jobs that arrived on a recent feed refresh so the feed can
 * tint their rows briefly.
 *
 * Arrival detection is not here. That belongs to the job-alerts tracker, whose
 * seen-set is the single source of truth for "new" across both the highlight
 * and the alert toast, so the two can never disagree. This hook owns only how
 * long a highlight lasts.
 */
export function useNewJobHighlight() {
  const [highlightedIds, setHighlightedIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  /** Pending expiry timers. Mutated in place; never reassigned. */
  const timeoutsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      for (const handle of timeouts) window.clearTimeout(handle);
      timeouts.clear();
    };
  }, []);

  /**
   * One timer per batch rather than one shared deadline: two polls landing a
   * few seconds apart must each give their own jobs the full duration, instead
   * of the later batch inheriting whatever is left of the earlier one.
   */
  const markArrivals = useCallback((jobIds: string[]) => {
    if (jobIds.length === 0) return;
    const batch = [...jobIds];
    setHighlightedIds((prev) => {
      const next = new Set(prev);
      for (const id of batch) next.add(id);
      return next;
    });
    const handle = window.setTimeout(() => {
      timeoutsRef.current.delete(handle);
      setHighlightedIds((prev) => {
        const next = new Set(prev);
        for (const id of batch) next.delete(id);
        return next;
      });
    }, NEW_JOB_HIGHLIGHT_MS);
    timeoutsRef.current.add(handle);
  }, []);

  /** Drop every highlight at once, for a query change. */
  const reset = useCallback(() => {
    for (const handle of timeoutsRef.current) window.clearTimeout(handle);
    timeoutsRef.current.clear();
    setHighlightedIds((prev) => (prev.size === 0 ? prev : new Set<string>()));
  }, []);

  const isNew = useCallback(
    (jobId: string) => highlightedIds.has(jobId),
    [highlightedIds],
  );

  return { isNew, markArrivals, reset };
}
