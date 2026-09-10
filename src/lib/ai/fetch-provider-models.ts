import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { aiErrorStatus, type AIProvider } from "@/lib/ai/ai-failure";

/**
 * Asks a provider which models a key can actually reach.
 *
 * Both providers expose this as free metadata — no prompt, no completion, no
 * tokens billed — which is why the model dropdown can be built from live data
 * instead of a hardcoded list that goes stale. `verify-key.ts` already leans on
 * the OpenAI half of this for its key probe.
 *
 * Shaped like `verifyProviderKey`: one function taking the provider, so callers
 * do not branch on it themselves.
 */
export type ProviderModelFetch =
  | { ok: true; ids: string[] }
  /** The provider's HTTP status, when there was one. Never its message. */
  | { ok: false; status: number | undefined };

/**
 * A model list is a convenience on a settings screen, not part of any critical
 * path, so it gets a short leash. The SDK default is ten minutes, which would
 * hold a request open long past the point the user has given up and navigated
 * away.
 */
const LIST_TIMEOUT_MS = 10_000;
const LIST_MAX_RETRIES = 1;

export async function fetchProviderModels(
  provider: AIProvider,
  apiKey: string,
): Promise<ProviderModelFetch> {
  const key = apiKey.trim();
  if (!key) return { ok: false, status: undefined };

  try {
    if (provider === "openai") {
      const client = new OpenAI({
        apiKey: key,
        timeout: LIST_TIMEOUT_MS,
        maxRetries: LIST_MAX_RETRIES,
      });
      // `/v1/models` answers in a single page; there is no cursor to follow.
      const page = await client.models.list();
      return { ok: true, ids: page.data.map((model) => model.id) };
    }

    const client = new Anthropic({
      apiKey: key,
      timeout: LIST_TIMEOUT_MS,
      maxRetries: LIST_MAX_RETRIES,
    });
    // This one is cursor-paginated, but Anthropic serves well under a hundred
    // models, so a single max-size page is the whole catalog.
    const page = await client.models.list({ limit: 100 });
    return { ok: true, ids: page.data.map((model) => model.id) };
  } catch (error) {
    // The status only. `ai-failure.ts` documents why the SDK's own message must
    // never travel: OpenAI's 401 text embeds a fragment of the user's key.
    return { ok: false, status: aiErrorStatus(error) };
  }
}
