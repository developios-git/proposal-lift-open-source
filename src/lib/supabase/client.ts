import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// `next build` refuses to run without these values (see assertBuildEnv in
// next.config.ts). The placeholders only keep module evaluation from throwing
// in contexts that skip that check, such as tests importing this file.
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
