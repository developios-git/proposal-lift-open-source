import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  FIRST_RUN_GETTING_STARTED_FLOW_VERSION,
  FLOW_IDS,
} from "@/lib/onboarding/constants";

type ServiceDb = SupabaseClient<Database>;

/**
 * Seeds a `first_run_getting_started` onboarding row (status "not_started") for
 * a freshly created user. `hasCompletedFirstRun` reads this row: anything other
 * than completed/skipped sends the user to `/getting-started` after sign-in.
 *
 * Select-then-insert guard, so it is safe to call more than once. Uses the
 * service-role client because the user's own session may not be established yet
 * at signup time.
 */
export async function seedFirstRunGettingStarted(
  service: ServiceDb,
  userId: string,
): Promise<{ created: boolean }> {
  const { data: existing } = await service
    .from("user_onboarding_state")
    .select("id")
    .eq("user_id", userId)
    .eq("flow_id", FLOW_IDS.firstRunGettingStarted)
    .maybeSingle();

  if (existing?.id) {
    return { created: false };
  }

  const { error } = await service.from("user_onboarding_state").insert({
    user_id: userId,
    flow_id: FLOW_IDS.firstRunGettingStarted,
    flow_version: FIRST_RUN_GETTING_STARTED_FLOW_VERSION,
    status: "not_started",
    current_step: 0,
  });

  if (error) {
    // Unique-constraint race (row created concurrently) is benign.
    console.error("seedFirstRunGettingStarted:", error.message);
    return { created: false };
  }

  return { created: true };
}
