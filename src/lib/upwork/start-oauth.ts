import { apiFetch } from "@/lib/api-fetch";

/**
 * Client-only: POST /api/upwork/connect then redirect to Upwork OAuth.
 * Same flow as Settings → Integrations → Connect Upwork Account.
 *
 * Upstream took a `shared` flag to authenticate against a platform-owned Upwork
 * app. There is no shared app here — everyone registers their own Upwork
 * developer app — so there is nothing to choose between.
 */
export async function redirectToUpworkOAuth(): Promise<void> {
  const res = await apiFetch("/api/upwork/connect", { method: "POST" });
  const data = (await res.json()) as { url?: string; error?: string };
  if (res.ok && typeof data.url === "string" && data.url.length > 0) {
    window.location.href = data.url;
    return;
  }
  throw new Error(data.error || "Failed to initiate Upwork connection.");
}
