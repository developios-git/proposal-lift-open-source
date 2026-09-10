/**
 * Public base URL, with a trailing slash.
 *
 * `NEXT_PUBLIC_APP_URL` is this build's documented variable (see .env.example);
 * upstream read `NEXT_PUBLIC_SITE_URL` first, which is not set here and would
 * silently fall through to localhost — putting `http://localhost:3000` inside
 * every confirmation and password-reset email a deployed instance sends.
 * The upstream names are kept as fallbacks so a Vercel deploy still works.
 */
export function getURL() {
  let url =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL ??
    "http://localhost:3000";

  url = url.startsWith("http") ? url : `https://${url}`;
  url = url.endsWith("/") ? url : `${url}/`;
  return url;
}

/** Canonical public origin without a trailing slash. */
export function getSiteOrigin(): string {
  return getURL().replace(/\/+$/, "");
}
