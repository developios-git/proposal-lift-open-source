import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { resolveConfirmParams } from "@/lib/auth/confirm-params";
import { resolvePostAuthRedirect } from "@/lib/account/gate";
import { seedNewUserDefaults } from "@/lib/proposals/signup-default-template";
import type { AuthError, User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Email verification callback.
 *
 * Two link shapes land here — see `resolveConfirmParams`. Supabase's stock
 * template routes through its own `/auth/v1/verify`, which spends the token and
 * redirects back with a PKCE `code`; a template customised to point straight at
 * this route carries a `token_hash` instead. Both mean the same thing: mark the
 * profile verified and send the user wherever they belong.
 *
 * Upstream this also branched on `pending_plan` to either open a Stripe checkout
 * or park the account in one of three `account_state` values. With billing gone,
 * confirming an email means exactly one thing.
 */
/**
 * Whether this browser already holds a session for a confirmed address — the
 * only "have you done this already?" signal available when the link carries no
 * email to look up.
 */
async function sessionEmailConfirmed(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return Boolean(session?.user?.email_confirmed_at);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const params = resolveConfirmParams(searchParams);
  // Only a customised template supplies this; the `code` redirect never does, so
  // the already-verified lookup below is reachable on that path alone.
  const emailParam = searchParams.get("email") ?? "";

  if (params.kind === "missing") {
    return NextResponse.redirect(`${origin}/verify?status=missing_token`);
  }

  if (params.kind === "unsupported_type") {
    return NextResponse.redirect(`${origin}/verify?status=failed`);
  }

  const supabase = await createSupabaseServerClient();

  /**
   * Supabase spent the token itself and rejected it, so there is nothing left to
   * exchange — the link lapsed, was already used, or was consumed by a mail
   * scanner prefetching it before the user got there.
   */
  if (params.kind === "provider_error") {
    console.error(
      "Email confirmation rejected upstream:",
      params.code ?? "unknown",
      params.description ?? "",
    );

    if (await sessionEmailConfirmed(supabase)) {
      return NextResponse.redirect(`${origin}/verify?status=already_verified`);
    }

    // Lapsed and already-spent both arrive as `otp_expired`, and both recover
    // the same way: ask for a new link.
    const expired = params.code?.includes("expired") ?? false;
    return NextResponse.redirect(
      `${origin}/verify?status=${expired ? "expired" : "failed"}`,
    );
  }

  const verified =
    params.kind === "code"
      ? // Supabase already spent the token; trading the auth code it handed back
        // for a session is what confirms the address.
        await supabase.auth.exchangeCodeForSession(
          params.code,
          params.flowId ? { flowId: params.flowId } : undefined,
        )
      : await supabase.auth.verifyOtp({
          token_hash: params.tokenHash,
          type: params.type,
        });

  const user: User | null = verified.data.user;
  const error: AuthError | null = verified.error;

  if (error || !user) {
    console.error(
      "Email confirmation error:",
      error?.message || "Unknown error",
    );

    /**
     * Supabase returns the same error for an expired token and an already-used
     * one, so "already verified" has to be established separately — and asked
     * first. A successful exchange deletes the verifier it consumed, so merely
     * refreshing this callback afterwards raises the PKCE error below; answering
     * that with "wrong browser" would be nonsense to someone already verified in
     * this one.
     */
    if (await sessionEmailConfirmed(supabase)) {
      return NextResponse.redirect(`${origin}/verify?status=already_verified`);
    }

    /**
     * The PKCE verifier is a cookie written when the account signed up, so it is
     * only present in that browser. Nothing about the link is wrong — it is
     * being opened somewhere else — and saying "expired" would send the user
     * hunting for the wrong fix.
     */
    if (error?.code === "pkce_code_verifier_not_found") {
      const explain = encodeURIComponent(
        "This link has to be opened in the same browser you signed up from. Sign in to send yourself a new one.",
      );
      return NextResponse.redirect(
        `${origin}/verify?status=failed&message=${explain}`,
      );
    }

    // Signed out: ask the admin API about the address the link carried.
    if (emailParam) {
      try {
        const adminRes = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(emailParam)}&page=1&per_page=1`,
          {
            headers: {
              apikey: process.env.SUPABASE_SECRET_KEY!,
              Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY!}`,
            },
          },
        );
        if (adminRes.ok) {
          const body = (await adminRes.json()) as {
            users?: Array<{ email_confirmed_at?: string | null }>;
          };
          if (body.users?.[0]?.email_confirmed_at) {
            return NextResponse.redirect(
              `${origin}/verify?status=already_verified`,
            );
          }
        }
      } catch {
        // Fall through to the standard error handling below.
      }
    }

    const emailQuery = emailParam
      ? `&email=${encodeURIComponent(emailParam)}`
      : "";

    if (
      error?.message?.toLowerCase().includes("expired") ||
      error?.status === 403
    ) {
      return NextResponse.redirect(
        `${origin}/verify?status=expired${emailQuery}`,
      );
    }
    return NextResponse.redirect(`${origin}/verify?status=failed${emailQuery}`);
  }

  const service = createSupabaseServiceClient();

  const { error: upErr } = await service
    .from("profiles")
    .update({ is_verified: true })
    .eq("id", user.id);

  if (upErr) {
    console.error("confirm-callback verify:", upErr.message);
    return NextResponse.redirect(`${origin}/verify?status=failed`);
  }

  // Idempotent — covers an account created before these seeds existed, or one
  // whose signup seeding failed.
  await seedNewUserDefaults(service, user.id);

  const next = await resolvePostAuthRedirect(supabase, user);

  return NextResponse.redirect(
    `${origin}/verify?status=success&next=${encodeURIComponent(next)}`,
  );
}
