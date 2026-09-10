import { NextResponse, type NextRequest } from "next/server";
import { createProxySupabaseClient } from "@/lib/supabase/proxy";
import { resolvePostAuthRedirect } from "@/lib/account/gate";
import { resolveRouteAccess } from "@/lib/auth/route-access";
import { tryMiddlewareRateLimit } from "@/lib/rate-limit/middleware-rate-limit";

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts`.
 *
 * Three gates, in order: rate limit → session refresh → auth guard.
 *
 * Upstream carried five more — a billing lock, a deletion lock, an access lock,
 * platform-admin confinement, and a public-entry mode. None exist in this build:
 * there is no billing, no platform admin, and signup is open. Do not reintroduce
 * a profile lookup here to gate access; the only routing question left is "signed
 * in or not", plus the password-recovery detour.
 *
 * Which routes those rules cover lives in `resolveRouteAccess`, where it can be
 * tested. This file owns only the session lookup and the redirects.
 */

/**
 * Supabase writes its session as `sb-<project-ref>-auth-token`, sometimes split
 * across `.0`/`.1` chunks when it outgrows a single cookie. Matching the shape
 * rather than a configured name keeps this working for any self-hoster's
 * project ref, and reading only the names never puts a token in a log line.
 */
const SUPABASE_AUTH_COOKIE_RE = /^sb-.*-auth-token(\.\d+)?$/;

const supabaseAuthCookieNames = (request: NextRequest) =>
  request.cookies
    .getAll()
    .map((c) => c.name)
    .filter((name) => SUPABASE_AUTH_COOKIE_RE.test(name));

const hasSupabaseAuthCookie = (request: NextRequest) =>
  supabaseAuthCookieNames(request).length > 0;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const rateLimited = await tryMiddlewareRateLimit(request);
  if (rateLimited) {
    return rateLimited;
  }

  const { supabase, holder } = createProxySupabaseClient(request);

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  const hasResetCode = request.nextUrl.searchParams.has("code");
  const isRecoverySession =
    request.cookies.get("auth-type")?.value === "recovery";

  // A password-reset link signs the user in for real. Without this marker the
  // guest-only rule would bounce them straight to /dashboard and they could
  // never reach the form they were emailed.
  if (
    pathname === "/auth/reset-password" &&
    hasResetCode &&
    !isRecoverySession
  ) {
    holder.response.cookies.set("auth-type", "recovery", {
      path: "/",
      maxAge: 60 * 60,
      sameSite: "lax",
    });
  }

  const access = resolveRouteAccess({
    pathname,
    signedIn: Boolean(user),
    isRecoverySession,
    hasResetCode,
  });

  const redirectTo = (path: string, keepSearch = true) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    if (!keepSearch) url.search = "";
    return NextResponse.redirect(url);
  };

  if (access.kind === "pin_recovery") {
    return redirectTo("/auth/reset-password");
  }

  if (access.kind === "require_auth") {
    // A signed-out visitor hitting a protected page is the ordinary case and is
    // not worth a line. What is worth a line is this same branch taken while
    // the browser still holds a Supabase auth cookie: that is not a signed-out
    // visitor, it is a session read that came back empty, and the user is about
    // to be bounced through /login to /dashboard having asked for something
    // else. It has been seen intermittently and never reproduced on demand, so
    // record the evidence when it happens rather than guessing later.
    if (hasSupabaseAuthCookie(request)) {
      console.warn(
        "[proxy] auth cookie present but session read empty — bouncing to /login",
        {
          pathname,
          getUserError: userError?.message ?? null,
          cookieNames: supabaseAuthCookieNames(request),
        },
      );
    }

    // Carry the destination so login can send the user back to it. Without
    // this, every protected page lands on /dashboard after signing in, and the
    // extension consent screen — which is only meaningful with its query string
    // intact — could not be reached at all.
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (access.kind === "guest_only" && user) {
    const target = await resolvePostAuthRedirect(supabase, user);
    if (pathname !== target) {
      return redirectTo(target, false);
    }
  }

  return holder.response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
