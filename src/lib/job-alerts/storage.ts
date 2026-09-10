export const JOB_ALERTS_STORAGE_PREFIX = "filter-job-alerts:";

export function jobAlertsStorageKey(filterKey: string): string {
  return `${JOB_ALERTS_STORAGE_PREFIX}${filterKey}`;
}

export function readJobAlertsEnabled(filterKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(jobAlertsStorageKey(filterKey)) === "true";
  } catch {
    return false;
  }
}

export function writeJobAlertsEnabled(filterKey: string, enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(jobAlertsStorageKey(filterKey), String(enabled));
  } catch {
    /* ignore */
  }
}
