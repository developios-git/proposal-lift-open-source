import { seedNewUserDefaults } from "@/lib/proposals/signup-default-template";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { getURL } from "@/lib/url";
import { resolvePostAuthRedirect } from "@/lib/account/gate";
import { z } from "zod";

const signupEmailSchema = z.string().trim().email().max(320);

/**
 * Open self-serve signup.
 *
 * Upstream this was gated three ways — a Turnstile challenge, an approved
 * application token (mandatory in "apply" mode), and a plan/interval pair pinned
 * for a later Stripe checkout. None of those exist here, so the route validates
 * the body, creates the auth user, and seeds the new account's defaults.
 *
 * The `profiles` row itself is created by the `on_auth_user_created` trigger, not
 * here. This only fills in what the trigger cannot know.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const password = typeof body.password === "string" ? body.password : "";
    const fullName =
      typeof body.fullName === "string" ? body.fullName.trim() : "";

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 },
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }
    if (fullName.length > 200) {
      return NextResponse.json(
        { error: "Full name is too long" },
        { status: 400 },
      );
    }

    const parsedEmail = signupEmailSchema.safeParse(body.email);
    if (!parsedEmail.success) {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 },
      );
    }
    const email = parsedEmail.data.toLowerCase();

    const supabase = await createSupabaseServerClient();
    // getURL() ends with a slash.
    const baseUrl = getURL();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${baseUrl}auth/confirm-callback`,
        data: { full_name: fullName },
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Supabase returns 200 with no identities when the email already exists
    // (anti-enumeration), so an empty identities array is the "taken" signal.
    const identities = data.user?.identities;
    if (data.user && (!identities || identities.length === 0)) {
      return NextResponse.json(
        {
          error:
            "An account with this email already exists. Try signing in instead.",
        },
        { status: 409 },
      );
    }

    if (data.user) {
      const service = createSupabaseServiceClient();

      const { error: pErr } = await service
        .from("profiles")
        .update({
          is_verified: false,
          ...(fullName ? { full_name: fullName } : {}),
        })
        .eq("id", data.user.id);

      if (pErr) {
        console.error("signup profile update:", pErr.message);
      }

      await seedNewUserDefaults(service, data.user.id);
    }

    // Only set when email confirmation is off and a session came back straight
    // away; otherwise the client shows "check your email".
    let redirectTo: string | undefined;
    if (data.session && data.user) {
      redirectTo = await resolvePostAuthRedirect(supabase, data.user);
    }

    return NextResponse.json({
      user: data.user,
      session: data.session,
      redirectTo,
    });
  } catch (error) {
    console.error("POST /api/auth/signup:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
