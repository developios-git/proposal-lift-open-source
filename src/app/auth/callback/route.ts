import { seedNewUserDefaults } from "@/lib/proposals/signup-default-template";
import { safeAuthRedirectPath } from "@/lib/auth/safe-auth-redirect";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { resolvePostAuthRedirect } from "@/lib/account/gate";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/**
 * OAuth callback.
 *
 * Upstream this also ran an invite-only gate that deleted uninvited Google
 * accounts, applied application-form prefill, and consumed a signup token — plus
 * a plan/interval cookie pair that opened a Stripe checkout. Signup is open here
 * and there is no billing, so what remains is: exchange the code, seed the new
 * account, and route.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id) {
    // Idempotent, so it is safe on every sign-in — no need to detect a first
    // login, which upstream needed `registration_origin` and an age window for.
    await seedNewUserDefaults(createSupabaseServiceClient(), user.id);
  }

  /*
   * Upstream branched here on an `ext_oauth_intent` cookie set by
   * `/extension/google/start`, redirecting to `/extension/handoff`. That route
   * was never ported, so nothing set the cookie and the branch was dead — and
   * it dropped the query string, which would have broken extension sign-in the
   * moment anything did set it. Extension sign-in now rides the ordinary `next`
   * path below, query string and all.
   */

  // An explicit `next` wins (and is sanitised against open redirects);
  // otherwise route by the account's own state.
  const next = rawNext
    ? safeAuthRedirectPath(rawNext)
    : user
      ? await resolvePostAuthRedirect(supabase, user)
      : "/dashboard";

  const response = NextResponse.redirect(`${origin}${next}`);

  if (next.includes("/auth/reset-password")) {
    response.cookies.set("auth-type", "recovery", {
      path: "/",
      httpOnly: false,
      maxAge: 60 * 60,
      sameSite: "lax",
    });
  }

  return response;
}
