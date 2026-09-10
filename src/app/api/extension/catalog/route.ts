import { resolveAnthropicApiKey, resolveOpenAIApiKey } from "@/lib/ai/keys";
import { buildModelOptions } from "@/lib/ai/model-options";
import { mergeCors } from "@/lib/extension/cors";
import { filterPersonasEligibleForProposals } from "@/lib/personas/persona-proposal-eligibility";
import { createSupabaseForApiRequest } from "@/lib/supabase/api-auth";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Everything the extension needs to populate its pickers, in one round trip.
 *
 * Upstream also returns `organizationId` and `isPaidPlan`, both gone: rows here
 * are user-owned and there is no billing.
 *
 * `models` replaces upstream's plan-derived `proposalModel`. Same field, wholly
 * different reason for existing — not "what your tier allows" but "which of the
 * providers you configured in Settings, with the model you chose for each".
 * Built by the same `buildModelOptions` the new-proposal page uses, so the panel
 * and the web app cannot offer different models for one account.
 *
 * `hasOpenAiKey` stays even though the panel now gates on `models` instead. The
 * extension ships through the Chrome Web Store while the server is self-hosted,
 * so the two versions drift by design: an older panel talking to this server
 * still needs the field it knows. Removing it would break those installs
 * silently.
 *
 * Every table is `user_id`-owned and this client carries the caller's JWT, so
 * RLS does the scoping. No `.eq("user_id", …)` is load-bearing here; the ones
 * present are belt-and-braces, matching the rest of the repo.
 */

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: mergeCors(request, {}),
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await createSupabaseForApiRequest(request);
    if (auth.supabase === null) {
      return NextResponse.json(
        { error: auth.error },
        {
          status: auth.status,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    const userId = auth.user.id;

    const [personaRes, templateRes, hookRes, settingsRes] = await Promise.all([
      // `select("*")` rather than a column list because
      // `filterPersonasEligibleForProposals` scores the whole profile — a
      // narrowed select would silently drop a persona's completion score and
      // hide personas the web app shows.
      auth.supabase
        .from("personas")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      auth.supabase
        .from("templates")
        .select("id, name, category, is_default, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      auth.supabase
        .from("hooks")
        .select("id, title, description, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      auth.supabase
        .from("user_settings")
        .select(
          "openai_api_key, anthropic_api_key, openai_model, anthropic_model",
        )
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const failure = personaRes.error ?? templateRes.error ?? hookRes.error;
    if (failure) {
      return NextResponse.json(
        { error: failure.message },
        {
          status: 500,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    const allPersonas = personaRes.data ?? [];

    // Through the resolvers, so an encrypted key is decrypted and one that will
    // not decrypt counts as absent — the same view of "connected" the web app
    // has, rather than a raw truthiness test on the column.
    const settings = settingsRes.data;
    const openAiKey = resolveOpenAIApiKey(settings?.openai_api_key);
    const anthropicKey = resolveAnthropicApiKey(settings?.anthropic_api_key);

    return NextResponse.json(
      {
        personas: filterPersonasEligibleForProposals(allPersonas),
        // Pre-filter count, so the extension can tell "you have no personas"
        // apart from "none of your personas is complete enough to use". Those
        // need different advice.
        totalPersonaCount: allPersonas.length,
        templates: templateRes.data ?? [],
        hooks: hookRes.data ?? [],
        models: buildModelOptions({
          openaiConnected: openAiKey !== null,
          openaiModel: settings?.openai_model,
          anthropicConnected: anthropicKey !== null,
          anthropicModel: settings?.anthropic_model,
        }),
        hasOpenAiKey: openAiKey !== null,
      },
      { headers: mergeCors(request, { "Content-Type": "application/json" }) },
    );
  } catch (e) {
    console.error("extension catalog", e);
    return NextResponse.json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: mergeCors(request, { "Content-Type": "application/json" }),
      },
    );
  }
}
