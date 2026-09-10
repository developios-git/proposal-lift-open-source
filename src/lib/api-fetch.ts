/**
 * Wrapper for client-side calls to our `/api/*` routes.
 *
 * Upstream this sat behind a telemetry wrapper that reported failures to a
 * third-party error service. This build ships no telemetry, so failures are
 * logged to the browser console instead — which is what a self-hoster can
 * actually read when their own instance returns a 500.
 *
 * It returns the `Response` so call sites keep their existing `.json()` flow.
 */
export async function apiFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const method = (init?.method ?? "GET").toUpperCase();

  try {
    const res = await fetch(input, init);

    const shouldLog =
      res.status >= 500 ||
      res.status === 400 ||
      res.status === 403 ||
      res.status === 404;

    if (!res.ok && shouldLog) {
      let bodyText: string | null = null;
      try {
        // Clone so the caller's own `.json()` still has an unread body.
        bodyText = await res.clone().text();
      } catch {
        /* ignore */
      }
      console.error(
        `[api-fetch] ${method} ${url} → ${res.status} ${res.statusText}`,
        bodyText,
      );
    }

    return res;
  } catch (error) {
    // An abort is the caller cancelling on purpose (a superseded search, an
    // unmount), not a failure. Logging it as a "network error" made every
    // dev-mode Strict Mode remount look like the app was broken.
    if (!isAbortError(error)) {
      console.error(`[api-fetch] ${method} ${url} → network error`, error);
    }
    throw error;
  }
}

/** True for the `DOMException` a cancelled `fetch` rejects with. */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Releases a response the caller has decided to throw away.
 *
 * A `Response` whose body is never read holds an open stream. When the request
 * is then aborted, that stream errors, and its rejection has nothing observing
 * it — the browser reports it as an uncaught `AbortError` in a promise, with a
 * stack pointing at the `abort()` call rather than at anything that looks like
 * a bug.
 *
 * So any bail-out between "the response arrived" and "the body was read" has to
 * come through here. `cancel()` itself rejects on an already-errored stream,
 * hence the empty catch: this function exists precisely to make a rejection
 * nobody cares about observed.
 */
export function discardResponseBody(res: Response): void {
  void res.body?.cancel().catch(() => {});
}
