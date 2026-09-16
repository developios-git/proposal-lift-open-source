/**
 * Startup check for the environment variables the server cannot run without.
 *
 * Server-only (read by src/instrumentation.ts). Without it, a missing value
 * surfaces much later and far from its cause — e.g. an empty SUPABASE_SECRET_KEY
 * made signup answer "Internal server error" with nothing in the logs.
 *
 * Every message names the variable, because "SUPABASE_SECRET_KEY is not set"
 * tells a self-hoster what to do and "configuration error" does not.
 *
 * The two encryption keys are not checked here: readEncryptionKey() in
 * src/lib/crypto/secret-box.ts already validates them with named messages.
 */

export type ServerEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string | undefined;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string | undefined;
  SUPABASE_SECRET_KEY: string | undefined;
  NEXT_PUBLIC_APP_URL: string | undefined;
  UPWORK_REDIRECT_URI: string | undefined;
};

export type EnvProblems = { errors: string[]; warnings: string[] };

/** The host .env.example ships with, so copying it without editing is caught. */
const PLACEHOLDER_SUPABASE_HOST = "your-project-ref";

/** NEXT_PUBLIC_* are compiled into the build; a restart keeps the old value. */
const REBUILD_HINT =
  "Set it in .env and rebuild (docker compose up --build), or in your Vercel " +
  "project's environment variables and redeploy.";

const RESTART_HINT =
  "Set it in .env and recreate the container (docker compose up -d), or in " +
  "your Vercel project's environment variables and redeploy.";

/**
 * Reads each variable by its literal name. Next.js only inlines NEXT_PUBLIC_*
 * values written this way; `process.env[name]` would read something else.
 */
export function readServerEnv(): ServerEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    UPWORK_REDIRECT_URI: process.env.UPWORK_REDIRECT_URI,
  };
}

const isHttpUrl = (value: string) => /^https?:\/\/\S+$/.test(value);

export function findEnvProblems(env: ServerEnv): EnvProblems {
  const errors: string[] = [];
  const warnings: string[] = [];

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    errors.push(`NEXT_PUBLIC_SUPABASE_URL is not set. ${REBUILD_HINT}`);
  } else if (supabaseUrl.includes(PLACEHOLDER_SUPABASE_HOST)) {
    errors.push(
      "NEXT_PUBLIC_SUPABASE_URL is still the example value from .env.example. " +
        `Use your project's URL from Supabase → Project Settings → API. ${REBUILD_HINT}`,
    );
  } else if (!isHttpUrl(supabaseUrl)) {
    errors.push(
      `NEXT_PUBLIC_SUPABASE_URL must start with http:// or https:// (got "${supabaseUrl}"). ${REBUILD_HINT}`,
    );
  }

  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) {
    errors.push(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set. ${REBUILD_HINT}`);
  }

  if (!env.SUPABASE_SECRET_KEY?.trim()) {
    errors.push(`SUPABASE_SECRET_KEY is not set. ${RESTART_HINT}`);
  }

  // Optional (falls back to localhost / the Vercel URL), but if set it must
  // parse: it becomes metadataBase and the links in every auth email.
  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl && !isHttpUrl(appUrl)) {
    errors.push(
      `NEXT_PUBLIC_APP_URL must start with http:// or https:// (got "${appUrl}"). ${REBUILD_HINT}`,
    );
  }

  if (!env.UPWORK_REDIRECT_URI?.trim()) {
    warnings.push(
      "UPWORK_REDIRECT_URI is not set. The app runs, but connecting Upwork will fail until it is.",
    );
  }

  return { errors, warnings };
}
