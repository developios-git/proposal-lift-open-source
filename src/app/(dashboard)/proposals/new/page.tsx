import { redirect } from "next/navigation";
import { GenerateProposalForm } from "@/components/proposals/GenerateProposalForm";
import { resolveAnthropicApiKey, resolveOpenAIApiKey } from "@/lib/ai/keys";
import { buildModelOptions } from "@/lib/ai/model-options";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Resolves what the form needs to know before it renders.
 *
 * The form used to ask `/api/settings` for this from an effect, with
 * `hasOpenAiKey` initialised to `false`. That meant the "add your OpenAI key"
 * banner and a disabled model dropdown were both asserted on the first client
 * paint — before anything had been checked — and then withdrawn a round trip
 * later for the many users who did have a key. Reading it here puts the right
 * answer in the first HTML instead, and removes a request from every visit.
 *
 * Taking the search params as a server prop matters for the same reason: the
 * `useSearchParams` call this replaces forced a Suspense boundary, and that
 * boundary's fallback was the spinner that used to precede the banner.
 *
 * The keys resolve through the same helpers `/api/extension/catalog` uses, so
 * the web app and the extension cannot disagree about which models an account
 * may generate with.
 */

/** `?jobId=` and friends are single-valued; an array means a malformed URL. */
function one(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value.trim() || null;
  return null;
}

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The dashboard layout already redirects an unauthenticated visitor; this is
  // belt and braces so the query below never runs without a user id.
  if (!user) redirect("/login");

  const { data: settings } = await supabase
    .from("user_settings")
    .select("openai_api_key, anthropic_api_key, openai_model, anthropic_model")
    .eq("user_id", user.id)
    .maybeSingle();

  // Through the resolvers, so an encrypted key is decrypted and one that will
  // not decrypt counts as absent — the same view of "connected" Settings has.
  const openaiKey = resolveOpenAIApiKey(settings?.openai_api_key);
  const anthropicKey = resolveAnthropicApiKey(settings?.anthropic_api_key);

  return (
    <GenerateProposalForm
      hasOpenAiKey={openaiKey !== null}
      modelOptions={buildModelOptions({
        openaiConnected: openaiKey !== null,
        openaiModel: settings?.openai_model,
        anthropicConnected: anthropicKey !== null,
        anthropicModel: settings?.anthropic_model,
      })}
      jobId={one(params.jobId)}
      proposalId={one(params.proposalId)}
      prefillKey={one(params.prefillKey)}
      template={one(params.template)}
    />
  );
}
