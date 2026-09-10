import type { ProposalTenant } from "@/lib/extension/membership";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WebhookEligibilityCode = "not_connected" | "no_filters";

export type WebhookEligibility = {
  canCreate: boolean;
  code: WebhookEligibilityCode | null;
  reason: string | null;
};

/**
 * Decide whether a user may create a webhook notification.
 *
 * Webhooks are delivered by a background cron that polls Upwork per filter.
 * That only makes sense when:
 *  - the user has connected an Upwork account (no access token means the cron
 *    cannot fetch anything), AND
 *  - the user has at least one saved filter (webhooks notify about new jobs
 *    matching a filter — with none there is nothing to deliver).
 *
 * Checked in priority order so the message points at the first blocking step.
 *
 * Upstream had a third, higher-priority check: shared Upwork access was refused
 * outright, because cron polling would drain the platform's shared quota. There
 * is no shared access here — everyone polls with their own Upwork app against
 * their own quota — so that arm is gone along with its `"shared"` code.
 *
 * `supabase` may be a user-scoped or service client; it only needs read access
 * to the user's settings row and saved filters.
 */
export async function resolveWebhookEligibility(
  supabase: SupabaseClient<Database>,
  tenant: ProposalTenant,
): Promise<WebhookEligibility> {
  const { data: settings } = await supabase
    .from("user_settings")
    .select("upwork_access_token")
    .eq("user_id", tenant.userId)
    .maybeSingle();

  if (!settings?.upwork_access_token) {
    return {
      canCreate: false,
      code: "not_connected",
      reason: "Connect your Upwork account before adding a webhook.",
    };
  }

  const { count } = await supabase
    .from("saved_job_filters")
    .select("id", { count: "exact", head: true })
    .eq("user_id", tenant.userId);

  if (!count || count === 0) {
    return {
      canCreate: false,
      code: "no_filters",
      reason: "Create a filter before adding a webhook.",
    };
  }

  return { canCreate: true, code: null, reason: null };
}
