const MAX_SEEN_IDS = 500;

export type JobAlertRow = { id: string; title: string };

export function createJobAlertsTracker() {
  let baselineEstablished = false;
  const seen = new Set<string>();

  function trimSeen() {
    if (seen.size <= MAX_SEEN_IDS) return;
    const arr = [...seen];
    for (const id of arr.slice(0, seen.size - MAX_SEEN_IDS)) {
      seen.delete(id);
    }
  }

  return {
    reset() {
      baselineEstablished = false;
      seen.clear();
    },
    /** First ingest establishes baseline (no alerts). Later ingests return jobs not yet seen. */
    ingest(jobs: JobAlertRow[]) {
      if (!baselineEstablished) {
        baselineEstablished = true;
        for (const j of jobs) seen.add(j.id);
        trimSeen();
        return { newJobs: [] as JobAlertRow[] };
      }
      const newJobs: JobAlertRow[] = [];
      for (const j of jobs) {
        if (!seen.has(j.id)) {
          newJobs.push(j);
          seen.add(j.id);
        }
      }
      trimSeen();
      return { newJobs };
    },
    /**
     * Record ids as seen without reporting them as arrivals. "Load more"
     * appends older results: their ids are unseen, but they are not new jobs,
     * so `ingest` would mislabel them. Deliberately does not touch
     * `baselineEstablished` — only a real fetch establishes the baseline.
     */
    markSeen(jobs: JobAlertRow[]) {
      for (const j of jobs) seen.add(j.id);
      trimSeen();
    },
  };
}

export type JobAlertsTracker = ReturnType<typeof createJobAlertsTracker>;
