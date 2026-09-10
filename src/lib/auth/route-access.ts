/**
 * The proxy's routing decision, as a pure function.
 *
 * The only questions left in this build are "signed in or not" and "is this a
 * password-recovery session" — there is no billing lock, no platform admin, and
 * no invite gate. Keeping the answer here rather than inline in `proxy.ts` is
 * what makes it testable; the proxy owns the redirects, this owns the rules.
 */

/**
 * Reachable while signed out.
 */
const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/verify",
  "/auth/callback",
  "/auth/confirm-callback",
  "/auth/upwork/callback",
  "/auth/forget-password",
  "/auth/reset-password",
];

/**
 * Pages a signed-in user should never sit on.
 *
 * The reset form belongs here as much as login does: a reset link grants a real
 * session, so leaving the form open to anyone already signed in turns it into a
 * password change with no current-password check. Settings owns that flow.
 */
const GUEST_ONLY_ROUTES = [
  "/login",
  "/signup",
  "/auth/forget-password",
  "/auth/reset-password",
];

/**
 * Must stay reachable mid-flow whatever the session looks like — these finish an
 * authentication, they are not somewhere a user lands.
 */
/*
 * `/extension/google/start` used to sit here and in PUBLIC_ROUTES. The route was
 * never ported — see the comment in `src/app/auth/callback/route.ts` — so both
 * entries described a path that does not exist. Extension sign-in reaches Google
 * through the ordinary `/login` flow now, carrying its destination in `next`.
 */
const CALLBACK_ROUTES = [
  "/auth/callback",
  "/auth/confirm-callback",
  "/auth/upwork/callback",
];

const RESET_ROUTE = "/auth/reset-password";

/** Exact path, or a segment below it — never a bare prefix like `/loginfoo`. */
const covers = (routes: string[], pathname: string) =>
  routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

export type RouteAccessInput = {
  pathname: string;
  signedIn: boolean;
  /** The `auth-type=recovery` marker set when a reset link is redeemed. */
  isRecoverySession: boolean;
  /** A `?code=` on the request, i.e. a reset link still being handed off. */
  hasResetCode: boolean;
};

export type RouteAccess = {
  kind: "allow" | "require_auth" | "guest_only" | "pin_recovery";
};

export function resolveRouteAccess({
  pathname,
  signedIn,
  isRecoverySession,
  hasResetCode,
}: RouteAccessInput): RouteAccess {
  // API routes answer 401 themselves rather than being redirected into HTML.
  if (pathname.startsWith("/api/")) return { kind: "allow" };

  const isPublic = pathname === "/" || covers(PUBLIC_ROUTES, pathname);

  if (!signedIn) {
    return isPublic ? { kind: "allow" } : { kind: "require_auth" };
  }

  if (isRecoverySession) {
    /**
     * Pin the session to the reset form until it finishes — including on the
     * guest-only pages. Exempting those was what let the marker double as a way
     * to sit on /login and /signup while signed in.
     */
    if (covers([RESET_ROUTE], pathname) || covers(CALLBACK_ROUTES, pathname)) {
      return { kind: "allow" };
    }
    return { kind: "pin_recovery" };
  }

  // A reset link still carrying its code is mid-handoff, not a page to bounce
  // off: the exchange has not happened yet, so there is no marker to read.
  if (pathname === RESET_ROUTE && hasResetCode) return { kind: "allow" };

  return covers(GUEST_ONLY_ROUTES, pathname)
    ? { kind: "guest_only" }
    : { kind: "allow" };
}
