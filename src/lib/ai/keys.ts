import { decryptAiApiKey } from "@/lib/crypto/ai-api-key";
import { isEncryptedSecret } from "@/lib/crypto/secret-box";

/**
 * AI keys are per user, always.
 *
 * Upstream both resolvers fell back to a platform key in the server environment
 * (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) whenever the tenant had not saved one
 * of their own. That fallback is the thing this build most deliberately does not
 * have: there is no platform account to bill, and a self-hoster's instance must
 * never quietly spend someone else's key.
 *
 * So these resolve to a saved key or null, and **never an env fallback.** Every
 * AI call site treats null as "ask the user to add a key in Settings" and fails
 * loudly rather than proceeding.
 *
 * `resolveOpenAIApiKeyForProposal` and `OPENAI_BYOK_NANO_MODEL` are gone with
 * it: that pair existed only to force one model (`gpt-5-nano`) to require the
 * tenant's own key while other models could ride the platform key. With no
 * platform key, every model is bring-your-own, so the distinction has no
 * meaning — call `resolveOpenAIApiKey` for all of them.
 *
 * **This module is server-only** — it reaches `node:crypto` through
 * `ai-api-key`. Client components that need the missing-key signal import
 * `./missing-api-key` directly.
 */

export {
  MissingApiKeyError,
  MISSING_API_KEY_CODE,
} from "./missing-api-key";

/**
 * Turns a stored column value into a usable API key.
 *
 * Two shapes live in that column. Keys saved since encryption shipped are
 * `v1:`-prefixed ciphertext; keys saved before it are plaintext, and are left
 * that way on purpose — no backfill was run, so they must keep working. The two
 * cannot be confused: provider keys begin `sk-`, and `isEncryptedSecret` tests
 * structure rather than guessing at a prefix.
 *
 * A key that will not decrypt resolves to null rather than throwing. Every
 * caller is typed for `string | null` and already turns null into "add your key
 * in Settings", which is also the fix — re-entering the key stores it under the
 * current `AI_KEYS_ENCRYPTION_KEY`. The `console.error` is for the operator who
 * rotated that variable and needs to know why every key stopped working; the
 * thrown error carries no key material, only the variable name or a generic
 * authentication failure.
 */
function resolveStoredApiKey(
  userKey: string | null | undefined,
  provider: "openai" | "anthropic",
): string | null {
  const trimmed = (userKey ?? "").trim();
  if (!trimmed) return null;

  if (!isEncryptedSecret(trimmed)) return trimmed;

  try {
    return decryptAiApiKey(trimmed) || null;
  } catch (error) {
    console.error(
      `[ai-keys] Stored ${provider} API key could not be decrypted. If AI_KEYS_ENCRYPTION_KEY was changed, affected users must re-enter their key in Settings.`,
      error,
    );
    return null;
  }
}

export function resolveOpenAIApiKey(
  userKey: string | null | undefined,
): string | null {
  return resolveStoredApiKey(userKey, "openai");
}

export function resolveAnthropicApiKey(
  userKey: string | null | undefined,
): string | null {
  return resolveStoredApiKey(userKey, "anthropic");
}
