/**
 * Computes and persists the pgvector embedding for a project (portfolio
 * matching). Shared by POST /api/projects/embed and bulk import.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpenAIApiKeyForTenant } from "@/lib/ai/openai-api-key-for-tenant";
import {
  embedText,
  buildProjectEmbeddingText,
  MissingOpenAIKeyError,
} from "@/lib/ai/embeddings";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { ProposalTenant } from "@/lib/extension/membership";
import type { Database } from "@/types/database";

export type StoreEmbeddingResult =
  | { ok: true }
  | { ok: false; message: string; code: "not_found" | "missing_key" | "failed" };

export async function storeProjectEmbeddingForTenant(
  supabase: SupabaseClient<Database>,
  tenant: ProposalTenant,
  projectId: string,
): Promise<StoreEmbeddingResult> {
  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("id, name, category, technologies, description")
    .eq("id", projectId)
    .eq("user_id", tenant.userId)
    .maybeSingle();

  if (fetchError || !project) {
    return { ok: false, message: "Project not found", code: "not_found" };
  }

  const apiKey = await getOpenAIApiKeyForTenant(supabase, tenant);

  // Distinguished from a failed API call: this is the expected state for a user
  // who has not saved a key yet, and the project stays valid with a NULL
  // embedding until they do. The UI surfaces that rather than hiding it.
  if (!apiKey) {
    return {
      ok: false,
      message: new MissingOpenAIKeyError().message,
      code: "missing_key",
    };
  }

  let vector: number[];
  try {
    vector = await embedText(buildProjectEmbeddingText(project), apiKey);
  } catch (e) {
    if (e instanceof MissingOpenAIKeyError) {
      return { ok: false, message: e.message, code: "missing_key" };
    }
    console.error("[storeProjectEmbeddingForTenant] embed failed:", e);
    return {
      ok: false,
      message: "Could not generate the embedding. Check your OpenAI key.",
      code: "failed",
    };
  }

  // Service client: `projects.embedding` is `public.vector`, which supabase-js
  // cannot express in a typed update, and the literal form below is the only
  // shape pgvector accepts over PostgREST.
  const serviceClient = createSupabaseServiceClient();
  const { data: updatedRow, error: updateError } = await serviceClient
    .from("projects")
    .update({ embedding: `[${vector.join(",")}]` })
    .eq("id", project.id)
    .eq("user_id", tenant.userId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error(
      "[storeProjectEmbeddingForTenant] pgvector update:",
      updateError,
    );
    return { ok: false, message: "Failed to store embedding", code: "failed" };
  }

  if (!updatedRow) {
    console.error(
      "[storeProjectEmbeddingForTenant] update matched 0 rows (owner/id mismatch)",
    );
    return { ok: false, message: "Failed to store embedding", code: "failed" };
  }

  return { ok: true };
}
