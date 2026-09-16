import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isGoogleAuthEnabled } from "@/lib/auth/google-auth-enabled";
import { safeAuthRedirectPath } from "@/lib/auth/safe-auth-redirect";
import { getRequestOrigin } from "@/lib/url";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Starts the Google OAuth round-trip and hands the consent URL back to the
 * caller, which navigates to it.
 *
 * Upstream this also accepted `plan` / `interval` in the body and pinned them as
 * `pending_plan` / `pending_interval` cookies for a Stripe checkout on the way
 * back. There is no billing here, so the only thing the body carries is `next`.
 *
 * `next` has to travel through Google and back out of `/auth/callback`, because
 * the consent screen leaves this origin entirely — no cookie or client state is
 * guaranteed to survive it. It is sanitised here as well as in the callback:
 * this value ends up inside an OAuth `redirectTo`, and an unchecked one would
 * be an open redirect wearing a Google-shaped disguise.
 */
export async function POST(request: NextRequest) {
  // Refuse rather than hand back a URL that cannot work. Without the flag the
  // login page never renders the button, so reaching this is a direct call.
  if (!isGoogleAuthEnabled()) {
    return NextResponse.json(
      { error: "Google sign-in is not enabled on this instance." },
      { status: 404 },
    );
  }

  try {
    let next: string | null = null;
    try {
      const body = (await request.json()) as { next?: unknown };
      if (typeof body?.next === "string" && body.next) {
        next = safeAuthRedirectPath(body.next);
      }
    } catch {
      // No body, or not JSON. Routing falls back to account state.
    }

    const supabase = await createSupabaseServerClient();
    const origin = getRequestOrigin(request);
    const callbackUrl = next
      ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
      : `${origin}/auth/callback`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ url: data.url });
  } catch (error) {
    console.error("POST /api/auth/google:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
