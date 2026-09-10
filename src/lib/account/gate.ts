import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { FLOW_IDS } from "@/lib/onboarding/constants";
import { postAuthRedirectPath } from "./account-state";

type Db = SupabaseClient<Database>;

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * Sync `profiles.is_verified` when Supabase Auth says the email is confirmed but
 * the profile is stale — e.g. the user closed the tab before the confirm
 * callback finished.
 *
 * This is a mirror repair only. Nothing downstream may branch on `is_verified`
 * in place of `user.email_confirmed_at`; upstream this function also moved a
 * six-value `account_state` machine along, and all of that is gone.
 */
export async function repairProfileAfterEmailConfirmed(
  supabase: Db,
  user: User,
  profile: ProfileRow | null,
): Promise<ProfileRow | null> {
  if (!user.email_confirmed_at || !profile) return profile;
  if (profile.is_verified) return profile;

  const { data } = await supabase
    .from("profiles")
    .update({ is_verified: true })
    .eq("id", user.id)
    .select("*")
    .single();

  return data ?? profile;
}

/**
 * True once the first-run Getting Started flow has been completed or skipped.
 *
 * A missing row means the user has never started it, so they are sent to
 * `/getting-started`. Skipping counts as done — the user said no, and must not
 * be redirected back into it on every sign-in.
 */
export async function hasCompletedFirstRun(
  supabase: Db,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_onboarding_state")
    .select("status")
    .eq("user_id", userId)
    .eq("flow_id", FLOW_IDS.firstRunGettingStarted)
    .maybeSingle();

  return data?.status === "completed" || data?.status === "skipped";
}

/**
 * Where to send a user who has just authenticated, or who has landed on an
 * auth page while already signed in.
 */
export async function resolvePostAuthRedirect(
  supabase: Db,
  user: User,
): Promise<string> {
  const emailConfirmed = Boolean(user.email_confirmed_at);
  // Skip the query when it cannot change the answer: an unconfirmed user goes
  // to /verify regardless.
  const firstRunComplete = emailConfirmed
    ? await hasCompletedFirstRun(supabase, user.id)
    : false;

  return postAuthRedirectPath({ emailConfirmed, firstRunComplete });
}
