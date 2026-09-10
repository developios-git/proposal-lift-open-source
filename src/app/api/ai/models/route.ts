import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchProviderModels } from "@/lib/ai/fetch-provider-models";
import { resolveAnthropicApiKey, resolveOpenAIApiKey } from "@/lib/ai/keys";
import {
  dedupeModelIds,
  isChatModelId,
  type ModelCatalog,
  type ProviderCatalog,
} from "@/lib/ai/model-catalog";
import { PROVIDER_LABEL, type AIProvider } from "@/lib/ai/ai-failure";
import { NextResponse } from "next/server";

/**
 * The models the signed-in user can actually generate with, asked of each
 * provider using that user's own key.
 *
 * This replaces four hardcoded arrays that drifted apart (see
 * `lib/ai/model-catalog.ts`). Both providers serve their model list as free
 * metadata, so this costs no tokens — only the user's request quota.
 *
 * Read-only, and deliberately so: it must not create the `user_settings` row,
 * for the same reason `openai-api-key-for-tenant.ts` must not.
 */

/**
 * Why a lookup failed, in words that fit this screen.
 *
 * `classifyAIHttpStatus` is not reused here: its prose is written for a failed
 * generation and tells the reader to "check it in Settings, under AI Models" —
 * which is exactly where they already are when they read this.
 */
function describeListFailure(
  provider: AIProvider,
  status: number | undefined,
): string {
  const label = PROVIDER_LABEL[provider];

  if (status === 401 || status === 403) {
    return `${label} rejected this API key, so its models could not be loaded.`;
  }
  if (status === 429) {
    return `${label} is rate limiting this key, so its models could not be loaded.`;
  }
  if (status !== undefined && status >= 500) {
    return `${label} is unavailable right now, so its models could not be loaded.`;
  }
  return `Could not reach ${label} to load its models.`;
}

async function catalogFor(
  provider: AIProvider,
  apiKey: string | null,
): Promise<ProviderCatalog> {
  // No key is the first-run state, not an error. Empty list, nothing to report.
  if (!apiKey) return { connected: false, models: [], error: null };

  const result = await fetchProviderModels(provider, apiKey);
  if (!result.ok) {
    return {
      connected: true,
      models: [],
      error: describeListFailure(provider, result.status),
    };
  }

  return {
    connected: true,
    // Filter, then collapse each model's pinned snapshots into the one entry a
    // person actually means when they pick it. `dedupeModelIds` sorts.
    models: dedupeModelIds(
      result.ids.filter((id) => isChatModelId(provider, id)),
    ),
    error: null,
  };
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: settings } = await supabase
      .from("user_settings")
      .select("openai_api_key, anthropic_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    // Unlike the Upwork client secret, these are stored as written. The
    // resolvers only normalise empty-to-null; they never reach for an env key.
    const [openai, anthropic] = await Promise.all([
      catalogFor("openai", resolveOpenAIApiKey(settings?.openai_api_key)),
      catalogFor(
        "anthropic",
        resolveAnthropicApiKey(settings?.anthropic_api_key),
      ),
    ]);

    return NextResponse.json({ openai, anthropic } satisfies ModelCatalog);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
