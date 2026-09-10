/**
 * What an email confirmation link is carrying.
 *
 * Two shapes reach `/auth/confirm-callback`, because Supabase's own
 * `/auth/v1/verify` endpoint rewrites the link before the app ever sees it:
 *
 *  - `code` — the default email template. Supabase consumes the token itself and
 *    redirects to `redirect_to?code=<uuid>`, which only `exchangeCodeForSession`
 *    can turn into a session. Needs the PKCE verifier cookie from the browser
 *    that signed up.
 *  - `token_hash` + `type` — a template customised to link straight at the app.
 *    Verified server-side with `verifyOtp`, so it works from any device.
 *  - `error` — Supabase rejected the token before the app was reached: expired,
 *    already spent, or consumed by a mail scanner prefetching the link. It
 *    duplicates these into the fragment, which a server route cannot read, so
 *    the query-string copy is the only one available here.
 *
 * `code` wins over `token_hash` when both appear: it is the live one, and the
 * hash beside it would already have been spent by the redirect that produced the
 * code. An `error` outranks both — there is nothing left to verify.
 */
export type ConfirmParams =
  | { kind: "code"; code: string; flowId: string | null }
  | { kind: "token_hash"; tokenHash: string; type: "email" | "signup" }
  | { kind: "provider_error"; code: string | null; description: string | null }
  | { kind: "unsupported_type" }
  | { kind: "missing" };

/** `PKCE_FLOW_ID_PATTERN` in @supabase/auth-js. */
const FLOW_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export function resolveConfirmParams(params: URLSearchParams): ConfirmParams {
  if (params.get("error")?.trim()) {
    // `description` is for the server log only. It is URL-controlled text, and
    // putting it on the page would let a crafted link write arbitrary copy onto
    // our own domain.
    return {
      kind: "provider_error",
      code: params.get("error_code")?.trim() || null,
      description: params.get("error_description")?.trim() || null,
    };
  }

  const code = params.get("code")?.trim();
  if (code) {
    /**
     * auth-js stashes each flow's verifier in its own slot and stamps the link
     * with `sb_flow_id`. It reads that param off `window.location` itself, which
     * a route handler does not have, so it has to be handed over explicitly —
     * otherwise the exchange falls back to a fixed key holding only the *most
     * recent* flow's verifier, and starting any other auth flow before clicking
     * the link would break it.
     *
     * A malformed id is dropped rather than forwarded: auth-js fails an explicit
     * id fast instead of falling back, so passing junk from the URL would turn a
     * recoverable exchange into a dead one.
     */
    const rawFlowId = params.get("sb_flow_id")?.trim();
    const flowId =
      rawFlowId && FLOW_ID_PATTERN.test(rawFlowId) ? rawFlowId : null;
    return { kind: "code", code, flowId };
  }

  const tokenHash = params.get("token_hash")?.trim();
  const type = params.get("type")?.trim();
  if (!tokenHash || !type) return { kind: "missing" };

  // Password recovery has its own route, so anything else here is a link the
  // callback cannot honour — distinct from one that arrived incomplete.
  if (type !== "email" && type !== "signup") return { kind: "unsupported_type" };

  return { kind: "token_hash", tokenHash, type };
}
