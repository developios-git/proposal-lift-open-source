import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

/**
 * Supabase client for the proxy (Next 16's renamed middleware).
 *
 * The response is returned inside a holder because `setAll` replaces it when
 * Supabase refreshes the session — the caller must read `holder.response`
 * *after* awaiting an auth call, never capture it beforehand.
 */
export function createProxySupabaseClient(request: NextRequest) {
  const holder = { response: NextResponse.next({ request }) };

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          holder.response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            holder.response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            holder.response.headers.set(key, value),
          );
        },
      },
    },
  );

  return { supabase, holder };
}

/**
 * Refresh the session cookie and return the response carrying it.
 *
 * Kept for callers that only need the refresh and no routing decision.
 */
export async function updateSession(request: NextRequest) {
  const { supabase, holder } = createProxySupabaseClient(request);

  // Do not run code between createServerClient and getClaims(). A simple
  // mistake could make it very hard to debug issues with users being randomly
  // logged out.
  await supabase.auth.getClaims();

  return holder.response;
}
