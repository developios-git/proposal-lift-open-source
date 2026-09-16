import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

/**
 * The Supabase project this instance talks to. Read at build/start time on the
 * server, and folded into the CSP below.
 *
 * This MUST stay dynamic. Hardcoding a project URL here would make every
 * self-hosted deployment block requests to its own Supabase project: the app
 * builds, boots, and serves HTML, then fails at login with nothing but a CSP
 * violation in the browser console to explain it.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * Whether this build is running on Vercel. `VERCEL` is `"1"` there and unset
 * everywhere else.
 */
const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  /**
   * Produces .next/standalone/server.js, which the Docker runtime stage copies.
   * Without this the image has nothing to run.
   *
   * Off on Vercel, where it does not merely go unused but breaks the build.
   * Vercel injects its own build adapter and packages the app itself, never
   * reading .next/standalone. Meanwhile Next 16 builds with Turbopack by
   * default, and Turbopack skips collectBuildTraces() — the only writer of
   * .next/next-server.js.nft.json — because the adapter consumes per-entry
   * trace files instead. writeStandaloneDirectory() still reads that one file,
   * so the build dies with ENOENT immediately after the adapter's
   * onBuildComplete hook. Next's own source flags the combination: "output:
   * standalone might not be allowed if an adapter with onBuildComplete is
   * configured" (next/dist/build/index.js).
   */
  output: isVercel ? undefined : "standalone",

  // Pin the workspace root. Turbopack otherwise infers it by walking up looking
  // for a lockfile, so a stray package-lock.json in a user's home directory
  // makes it guess wrong and warn on every build. Self-hosters' machines are
  // not ours to tidy, so state it explicitly.
  turbopack: {
    root: __dirname,
  },

  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              `default-src 'self'; ` +
              `script-src 'self' 'unsafe-inline' 'unsafe-eval'; ` +
              `style-src 'self' 'unsafe-inline'; ` +
              `connect-src 'self' ${supabaseUrl};`,
          },
        ],
      },
      {
        /**
         * Page routes previously carried no security headers at all, which left
         * `/extension/handoff` — the consent screen that mints a session for the
         * Chrome extension — framable by any origin.
         *
         * Framing it is not directly a token theft: the code goes to Chrome's
         * own sentinel URL, which the framing page cannot read. But a Connect
         * button that can be clicked through an invisible overlay is a button
         * that can be pressed without intent, and the click is the only thing
         * standing between "visited a URL" and "minted a credential".
         *
         * `frame-ancestors` only — deliberately not a full page CSP. The API
         * policy above already needs `'unsafe-inline'` and `'unsafe-eval'`, so
         * extending it across every page is a change that needs its own testing
         * pass rather than a free ride on a security fix. The negative lookahead
         * keeps this from doubling up headers on `/api/*`.
         */
        source: "/((?!api/).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none';" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

/**
 * Fails `next build` when a value that gets compiled into the app is missing.
 * Otherwise the build succeeds and ships a broken app: the Supabase URL is
 * baked into the bundle and the CSP above, and the only symptom is a login
 * that fails with a console error.
 *
 * Only NEXT_PUBLIC_* are checked — server secrets are absent at build time on
 * purpose (the Docker builder stage never sees them). The runtime check, with
 * tests, is src/lib/env.ts; it can't be imported here because next.config.ts
 * doesn't resolve the `@/` alias or extensionless TypeScript imports.
 */
function assertBuildEnv() {
  const problems: string[] = [];
  const isHttpUrl = (value: string) => /^https?:\/\/\S+$/.test(value);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!url) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL is not set.");
  } else if (url.includes("your-project-ref")) {
    problems.push(
      "NEXT_PUBLIC_SUPABASE_URL is still the example value from .env.example.",
    );
  } else if (!isHttpUrl(url)) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL must start with http:// or https://.");
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) {
    problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set.");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl && !isHttpUrl(appUrl)) {
    problems.push("NEXT_PUBLIC_APP_URL must start with http:// or https://.");
  }

  if (problems.length > 0) {
    throw new Error(
      "Cannot build ProposalLift:\n" +
        problems.map((problem) => `  - ${problem}`).join("\n") +
        "\nSet these in .env (Docker: then run `docker compose up --build`) or in " +
        "your Vercel project's environment variables, then build again.",
    );
  }
}

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) assertBuildEnv();
  return nextConfig;
}
