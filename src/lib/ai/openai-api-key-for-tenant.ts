import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOpenAIApiKey } from "@/lib/ai/keys";
import type { ProposalTenant } from "@/lib/extension/membership";
import type { Database } from "@/types/database";

/**
 * The user's own OpenAI key, or null.
 *
 * Null means "not configured" and every caller must surface that to the user —
 * there is no platform key to fall back to. See `@/lib/ai/keys`.
 *
 * **This is a read, and it stays a read.** It previously created a
 * `user_settings` row through the service-role client when one was missing, so
 * that later writes had somewhere to land. That was wrong twice over:
 *
 *  - `PUT /api/settings` already upserts on `user_id`, so nothing downstream
 *    needs the row to exist in advance.
 *  - `createSupabaseServiceClient()` throws when `SUPABASE_SECRET_KEY` is unset.
 *    A user with no settings row is exactly a user who has saved no key, so the
 *    one case this function most needs to answer cleanly was the one case that
 *    threw — turning "add your OpenAI key in Settings" into a 500 at all
 *    eleven AI call sites.
 *
 * No row, an empty column, and whitespace all mean the same thing here: null.
 */
export async function getOpenAIApiKeyForTenant(
  supabase: SupabaseClient<Database>,
  tenant: ProposalTenant,
): Promise<string | null> {
  const { data } = await supabase
    .from("user_settings")
    .select("openai_api_key")
    .eq("user_id", tenant.userId)
    .maybeSingle();

  return resolveOpenAIApiKey(data?.openai_api_key);
}
