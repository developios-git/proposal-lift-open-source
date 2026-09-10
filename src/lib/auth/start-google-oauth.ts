import { apiFetch } from "@/lib/api-fetch";

/**
 * Kicks off the Google OAuth round-trip and navigates to the returned consent
 * URL. Shared by the login and signup pages.
 *
 * Upstream this also forwarded `plan` / `interval` to pin `pending_plan` and
 * `pending_interval` on the account created on the way back. Both columns are
 * gone with billing, so this takes no arguments.
 *
 * Returns an error string instead of toasting so the caller owns its own UI.
 *
 * `next` rides through Google and back out of `/auth/callback`, which is the
 * only way a post-OAuth destination survives the round trip — the consent
 * screen navigates away from this origin entirely, so nothing client-side
 * outlives it.
 */
export async function startGoogleOAuth(
  next?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await apiFetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next ? { next } : {}),
    });

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
      return { ok: true };
    }
    return {
      ok: false,
      error: data.error || "Failed to initiate Google login.",
    };
  } catch {
    return { ok: false, error: "Failed to initiate Google login." };
  }
}
