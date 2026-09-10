import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Placeholders keep `next build` working before a self-hoster has filled in
// .env — the bundle inlines NEXT_PUBLIC_* at build time, so a missing value
// would otherwise throw during prerender rather than at first use.
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseUrl = rawUrl.startsWith("http")
  ? rawUrl
  : "https://placeholder.supabase.co";
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const supabasePublishableKey = rawKey.length > 20 ? rawKey : "placeholder-key";

/** False until the self-hoster points .env at a real Supabase project. */
export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "your_supabase_project_url" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith("http"),
);

if (typeof window !== "undefined" && !isSupabaseConfigured) {
  console.warn(
    "Supabase is not configured. Copy .env.example to .env and fill in your project's URL and publishable key.",
  );
}

export const supabase = createBrowserClient<Database>(
  supabaseUrl,
  supabasePublishableKey,
);
