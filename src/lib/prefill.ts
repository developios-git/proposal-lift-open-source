/**
 * Client-side prefill utilities for secure job data transfer.
 * Used when job data cannot be fetched by ID (e.g. filter feed jobs from Upwork API
 * that may not be synced to our DB yet). Data is stored in sessionStorage and only
 * a random key is passed in the URL.
 */

const PREFILL_PREFIX = "proposal_prefill_";

export interface JobPrefillData {
  jobTitle: string;
  jobDescription: string;
  skills?: string[];
  budget?: string;
  /**
   * Whether `budget` is a project total or an hourly rate. Without it the form
   * cannot label the figure, and an hourly rate dropped into a "Budget ($)"
   * box reads as the whole project's worth.
   */
  budgetKind?: "fixed" | "hourly";
  experienceLevel?: string;
}

/**
 * Store job prefill data in sessionStorage and return a unique key.
 * Call this before navigating to /proposals/new, then pass the key as ?prefillKey=...
 */
export function storeJobPrefill(data: JobPrefillData): string {
  const key = `${PREFILL_PREFIX}${crypto.randomUUID()}`;
  if (typeof window !== "undefined") {
    sessionStorage.setItem(key, JSON.stringify(data));
  }
  return key;
}

/**
 * Retrieve and remove prefill data from sessionStorage.
 * Call this on /proposals/new when prefillKey is present.
 * Returns null if key not found or invalid.
 */
export function consumeJobPrefill(key: string): JobPrefillData | null {
  if (typeof window === "undefined") return null;
  if (!key.startsWith(PREFILL_PREFIX)) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as JobPrefillData;
    sessionStorage.removeItem(key);
    return data;
  } catch {
    return null;
  }
}
