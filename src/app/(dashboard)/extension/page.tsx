import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveOpenAIApiKey } from "@/lib/ai/keys";
import { filterPersonasEligibleForProposals } from "@/lib/personas/persona-proposal-eligibility";
import { publishedExtensionId } from "@/lib/extension/extension-id";
import { chromeWebStoreUrl } from "@/lib/extension/guide-content";
import ExtensionGuide from "./ExtensionGuide";

/**
 * The Chrome extension walkthrough.
 *
 * A server component because the useful half of this page is not prose: two of
 * the steps are prerequisites this instance can check before you install
 * anything, and answering "will the panel work once I connect it?" up front is
 * the difference between a guide and a page of instructions.
 *
 * Both checks go through the same helpers `/api/extension/catalog` uses, so
 * what this page promises and what the extension later finds cannot disagree.
 */
export default async function ExtensionPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The dashboard layout redirects anyone unauthenticated before this renders,
  // so a missing user here is a broken session rather than a real state: fall
  // through with nothing checked rather than throwing.
  const [settingsResult, personaResult] = user
    ? await Promise.all([
        supabase
          .from("user_settings")
          .select("openai_api_key")
          .eq("user_id", user.id)
          .maybeSingle(),
        // `select("*")` because completion is scored across the whole profile;
        // a narrowed select would quietly drop personas the app treats as
        // usable. Same reason the catalog route does it.
        supabase.from("personas").select("*").eq("user_id", user.id),
      ])
    : [null, null];

  // Through the resolver, so an encrypted key is decrypted and one that will
  // not decrypt counts as absent — the view of "saved" the rest of the app has,
  // rather than a truthiness test on the column.
  const hasApiKey =
    resolveOpenAIApiKey(settingsResult?.data?.openai_api_key) !== null;

  const personas = personaResult?.data ?? [];

  return (
    <ExtensionGuide
      webStoreUrl={chromeWebStoreUrl(publishedExtensionId())}
      hasApiKey={hasApiKey}
      personaCount={personas.length}
      usablePersonaCount={filterPersonasEligibleForProposals(personas).length}
    />
  );
}
