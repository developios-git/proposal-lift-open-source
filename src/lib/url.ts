/**
 * Public base URL, with a trailing slash.
 *
 * `NEXT_PUBLIC_APP_URL` is this build's documented variable (see .env.example);
 * upstream read `NEXT_PUBLIC_SITE_URL` first, which is not set here and would
 * silently fall through to localhost — putting `http://localhost:3000` inside
 * every confirmation and password-reset email a deployed instance sends.
 * The upstream names are kept as fallbacks so a Vercel deploy still works.
 *
 * The Vercel names are read in pairs, unprefixed copy included: Vercel exposes
 * the unprefixed ones to the server unconditionally, while the `NEXT_PUBLIC_`
 * copies only exist once a project opts into exposing system environment
 * variables. Reading only the prefixed ones is what let a stock Vercel deploy
 * fall through to localhost.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` (the project's stable domain, set even inside
 * preview deployments) outranks `VERCEL_URL` (regenerated for every single
 * deployment, and unusable under Deployment Protection). An email must not
 * carry a link that dies on the next push.
 *
 * `||`, not `??`: docker-compose passes a blank .env value through as "", which
 * must fall through to the next candidate rather than become "https://".
 */
export function getURL() {
  let url =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000";

  url = url.startsWith("http") ? url : `https://${url}`;
  url = url.endsWith("/") ? url : `${url}/`;
  return url;
}

/** Canonical public origin without a trailing slash. */
export function getSiteOrigin(): string {
  return getURL().replace(/\/+$/, "");
}

/** `host[:port]`, or `[v6::addr][:port]`. Anything else is not a host. */
const HOST_PATTERN = /^(?:[a-z0-9.-]+|\[[0-9a-f:]+\])(?::\d{1,5})?$/i;

/**
 * Bind-everything addresses. A server listens on these; a browser cannot
 * connect to one, which is the entire bug this module guards against.
 */
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);

function hostnameOf(host: string): string {
  const name = host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1)
    : host.split(":")[0];
  return name.toLowerCase();
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "[::1]" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

/** First entry of a possibly comma-joined proxy header. */
function firstHop(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

/**
 * The origin to build a redirect back to this app with, for one request.
 *
 * `new URL(request.url).origin` cannot be used for this. Next.js derives it
 * from the address the server bound to, so the standalone server in Docker
 * (`HOSTNAME=0.0.0.0`, see Dockerfile) hands back `http://0.0.0.0:3000` and
 * every auth redirect lands on a wildcard address the browser rejects with
 * ERR_ADDRESS_INVALID. The Host header the browser actually sent is correct in
 * that case, and in every other one.
 *
 * Precedence:
 *
 *  1. `NEXT_PUBLIC_APP_URL`. Explicit configuration outranks the request, so a
 *     deployment that pins its own address never consults a header a client
 *     could forge. Note the corollary: setting it to a production domain sends
 *     preview deployments there too. Leave it unset on Vercel, where step 2
 *     already resolves production and preview correctly on its own.
 *  2. `x-forwarded-host` / `host` — what the browser actually asked for.
 *     Correct with no configuration behind Vercel (custom domains and
 *     per-deployment preview URLs alike), behind any reverse proxy, inside
 *     Docker, and on whatever port `next dev` was started with.
 *  3. `getSiteOrigin()` — the Vercel system variables, then localhost.
 *
 * Only ever used for redirects on the current request; the links inside
 * outbound email are built from `getURL()`, which never reads a header.
 */
export function getRequestOrigin(request: { headers: Headers }): string {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) return getSiteOrigin();

  const host =
    firstHop(request.headers.get("x-forwarded-host")) ||
    firstHop(request.headers.get("host"));

  if (host && HOST_PATTERN.test(host)) {
    const hostname = hostnameOf(host);
    if (!WILDCARD_HOSTS.has(hostname)) {
      const proto =
        firstHop(request.headers.get("x-forwarded-proto")) ||
        (isLoopback(hostname) ? "http" : "https");
      return `${proto}://${host}`;
    }
  }

  return getSiteOrigin();
}
