import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                secure: process.env.NODE_ENV === "production",
              }),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if the proxy is refreshing user sessions.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS, so it is server-only and must never be
 * reachable from a client component.
 *
 * Needed for the tables that are deliberately narrower than "owner can do
 * anything": `extension_auth_handoffs` (RLS on, zero policies) and the
 * SELECT-only `upwork_api_usage`, `filter_webhook_state`, and
 * `webhook_delivery_log`, whose writes belong to a SECURITY DEFINER RPC or the
 * cron. Also used by account deletion, which calls `auth.admin`.
 */
export function createSupabaseServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        flowType: "pkce",
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
