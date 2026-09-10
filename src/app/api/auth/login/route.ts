import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import {
  repairProfileAfterEmailConfirmed,
  resolvePostAuthRedirect,
} from "@/lib/account/gate";

/**
 * Upstream this also checked `is_suspended`, a `PENDING_VERIFICATION`
 * account_state, and two org billing locks, signing the user back out for each.
 * None of those columns or concepts exist here.
 *
 * Unverified email is still handled — but by Supabase's own "Email not
 * confirmed" error rather than a mirrored column, so it cannot disagree with
 * Auth.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message === "Email not confirmed") {
        return NextResponse.json(
          {
            error:
              "Email is not verified. Please check your email for verification.",
            canResend: true,
            email,
          },
          { status: 401 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (!data.user) {
      return NextResponse.json({ error: "Login failed" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();

    await repairProfileAfterEmailConfirmed(supabase, data.user, profile);

    const redirectTo = await resolvePostAuthRedirect(supabase, data.user);

    return NextResponse.json({
      user: data.user,
      session: data.session,
      redirectTo,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
