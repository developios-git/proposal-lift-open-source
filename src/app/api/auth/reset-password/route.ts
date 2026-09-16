import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getRequestOrigin } from "@/lib/url";
import { NextResponse, type NextRequest } from "next/server";

/**
 * GET /api/auth/reset-password — the landing target for Supabase
 * password-reset emails (see `redirectTo` in /api/auth/forget-password).
 *
 * Supabase appends `?code=<pkce_code>`. That code has to be exchanged
 * server-side before any page can see a session, which is why the email points
 * here and not straight at the form.
 *
 *  1. Read `code`.
 *  2. Exchange it for a session (sets the session cookie).
 *  3. Mark the session as password-recovery, so the proxy pins it to the reset
 *     form — a reset link grants a real session, and without this marker it
 *     would double as a way into the whole app.
 *  4. Redirect to the form; on failure, back to forgot-password with a reason.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      `${origin}/auth/forget-password?error=missing_code`,
    );
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
    console.error(
      "[reset-password] exchangeCodeForSession error:",
      error.message,
    );
    return NextResponse.redirect(
      `${origin}/auth/forget-password?error=invalid_code`,
    );
  }

  const response = NextResponse.redirect(`${origin}/auth/reset-password/form`);
  response.cookies.set("auth-type", "recovery", {
    path: "/",
    maxAge: 60 * 60,
    sameSite: "lax",
  });
  return response;
}
