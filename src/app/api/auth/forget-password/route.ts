import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getURL } from "@/lib/url";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Upstream this sat behind a Turnstile challenge, because reset emails go to an
 * address the requester types and an unprotected form is an email-bombing tool
 * pointed at the sending domain. Turnstile is removed from this build, so the
 * remaining protection is the per-IP limiter the proxy applies to
 * /api/auth/* POSTs — which is only active when Upstash is configured.
 *
 * Self-hosters exposing this publicly should configure Upstash.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Points at the API route, not the page: the `?code=` Supabase appends must
    // be exchanged server-side before the form can find a session.
    const redirectTo = `${getURL()}api/auth/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      console.error("resetPasswordForEmail error:", error);
      return NextResponse.json(
        { error: error.message, success: false },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { message: "Password reset email sent", success: true },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Internal server error" },
      { status: 500 },
    );
  }
}
