import { createClient, type User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { NextRequest } from "next/server";

export type ApiAuthResult =
  | {
      supabase: ReturnType<typeof createClient<Database>>;
      user: User;
      authMode: "bearer" | "cookie";
    }
  | { supabase: null; user: null; error: string; status: 401 };

/**
 * Resolves the Supabase session for API routes: cookie session (browser) or
 * `Authorization: Bearer <jwt>` (the Chrome extension).
 *
 * Both arms use the publishable key, so RLS still applies — this authenticates
 * the caller, it does not elevate them.
 */
export async function createSupabaseForApiRequest(
  request: NextRequest,
): Promise<ApiAuthResult> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const jwt = authHeader.slice(7).trim();
    if (!jwt) {
      return { supabase: null, user: null, error: "Unauthorized", status: 401 };
    }
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      },
    );
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(jwt);
    if (error || !user) {
      return { supabase: null, user: null, error: "Unauthorized", status: 401 };
    }
    return { supabase, user, authMode: "bearer" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase: null, user: null, error: "Unauthorized", status: 401 };
  }
  return { supabase, user, authMode: "cookie" };
}
