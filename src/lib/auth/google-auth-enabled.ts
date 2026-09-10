/**
 * Whether to offer "Continue with Google".
 *
 * This is an explicit opt-in flag rather than a derived one. The app never reads
 * a Google client id or secret of its own — Supabase Auth holds those, and the
 * provider is turned on in the Supabase dashboard — so there is no app-side
 * value to infer from. Without a flag the button would render for every
 * self-hoster and dead-end for the ones who never configured the provider.
 *
 * Server-only: read it in a server component and pass the result down, so the
 * value never has to be inlined into the client bundle.
 */
export function isGoogleAuthEnabled(): boolean {
  const raw = process.env.GOOGLE_AUTH_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}
