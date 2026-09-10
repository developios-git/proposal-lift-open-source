/**
 * Generate a project's pgvector embedding immediately after it is saved, and
 * wait for it — but never indefinitely.
 *
 * This used to be fire-and-forget on both the create and edit pages, with a
 * 1s timer racing it to `router.push("/portfolios")`. The list always won:
 * it refetched before the embedding landed, so a project the user had just
 * added greeted them with a "Not searchable" badge and a banner reading
 * "1 project is not searchable yet" — for work that was, a second later,
 * perfectly searchable. The state was real, the timing made it a lie.
 *
 * Waiting first is what makes the list truthful. It costs the user the second
 * the embedding actually takes, and it does not put the saved row at risk:
 * the project is already committed by the time this runs. The timeout only
 * decides how long we are willing to stand still — the request itself is
 * never aborted, so a slow embedding still completes and still writes.
 *
 * A missing key is reported rather than swallowed: a project with no embedding
 * never reaches a proposal, and that has to be visible.
 */
import { apiFetch } from "@/lib/api-fetch";

export type EmbedAfterSaveResult =
  /** Embedding written; the project is matchable. */
  | "embedded"
  /** The user's OpenAI key is gone or rejected — actionable, must be surfaced. */
  | "missing_key"
  /** Transient: rate limit, outage, network. Backfill will pick it up. */
  | "failed"
  /** Still running when we stopped waiting. Not a failure, just not yet known. */
  | "timeout";

/** How long to hold the user before navigating anyway. */
const DEFAULT_TIMEOUT_MS = 8000;

export async function embedProjectAfterSave(
  projectId: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<EmbedAfterSaveResult> {
  // Deliberately not an AbortController: giving up on the wait must not give
  // up on the write.
  const embed = (async (): Promise<EmbedAfterSaveResult> => {
    try {
      const res = await apiFetch("/api/projects/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (res.ok) return "embedded";

      const body = (await res.json().catch(() => ({}))) as { code?: string };
      return body.code === "missing_key" ? "missing_key" : "failed";
    } catch (err) {
      console.warn("[portfolio] embedding generation failed:", err);
      return "failed";
    }
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<EmbedAfterSaveResult>((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  try {
    return await Promise.race([embed, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
