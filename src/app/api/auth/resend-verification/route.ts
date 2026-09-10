import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { getURL } from "@/lib/url";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    /**
     * The cookie-backed PKCE client, matching signup.
     *
     * This route used a plain implicit-flow client so the link would carry a
     * stateless OTP hash. That only works against a customised Supabase email
     * template; with the stock one, an implicit token comes back in the URL
     * *fragment*, which `/auth/confirm-callback` — a server route — cannot read
     * at all. PKCE returns `?code=` instead, which it can.
     *
     * The cost is that the verifier cookie is written here, so the new link only
     * opens in this browser. That is the same trade signup makes, and this route
     * is called from the browser that is waiting on the email.
     */
    const supabase = await createSupabaseServerClient();

    // getURL() ends with a slash.
    const baseUrl = getURL();

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${baseUrl}auth/confirm-callback`,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: "Verification email resent successfully",
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
