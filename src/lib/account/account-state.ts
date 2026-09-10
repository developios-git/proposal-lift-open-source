/**
 * Where a signed-in user belongs.
 *
 * Upstream this switched on `profiles.account_state`, a six-value column that
 * folded together email verification, plan selection, and deletion scheduling.
 * None of that survives in this build: there is no billing, no plan gate, and no
 * deletion grace period, and the column itself is gone from the schema.
 *
 * Two questions are left, and each has exactly one source of truth:
 *   - Is the email confirmed?  Supabase Auth's `user.email_confirmed_at`.
 *     `profiles.is_verified` is a mirror of it, repaired by `gate.ts`, never the
 *     authority — a stale mirror must not strand a confirmed user on /verify.
 *   - Has first-run onboarding finished?  `user_onboarding_state`.
 */

export type PostAuthInputs = {
  /** From Supabase Auth, not from `profiles.is_verified`. */
  emailConfirmed: boolean;
  /** True once the first-run Getting Started flow is completed or skipped. */
  firstRunComplete: boolean;
};

export function postAuthRedirectPath({
  emailConfirmed,
  firstRunComplete,
}: PostAuthInputs): string {
  if (!emailConfirmed) return "/verify";
  if (!firstRunComplete) return "/getting-started";
  return "/dashboard";
}
