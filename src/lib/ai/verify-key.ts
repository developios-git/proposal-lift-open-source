import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { aiErrorStatus, PROVIDER_LABEL, type AIProvider } from "@/lib/ai/ai-failure";

export type KeyVerification =
  | { status: "valid" }
  | { status: "invalid"; message: string }
  /** The probe never got an answer, so the key is neither proven nor disproven. */
  | { status: "unknown"; message: string };

/**
 * Probes a key against its provider.
 *
 * **Three outcomes, not two.** The previous boolean version collapsed "the
 * provider said no" and "I could not reach the provider" into the same `false`.
 * That is harmless for an advisory button and wrong for a save gate: an outage,
 * a DNS blip, or a self-hoster behind a proxy would make a perfectly good key
 * unsavable, with the app insisting it was invalid.
 *
 * Only 401/403 is `invalid`. A 429 is explicitly *not*: it means the key is
 * real and the account is rate-limited or out of credit, and refusing to store
 * a working key over a billing problem would be its own bug.
 *
 * The key is used for the probe and then discarded. It is never logged, never
 * echoed back, and the SDK's own error text (which embeds part of the key) is
 * never forwarded.
 */
export async function verifyProviderKey(
  provider: AIProvider,
  apiKey: string,
): Promise<KeyVerification> {
  const key = apiKey.trim();
  if (!key) {
    return { status: "invalid", message: "No API key was provided." };
  }

  try {
    if (provider === "openai") {
      // Free, and proves nothing more than that the key is accepted.
      await new OpenAI({ apiKey: key }).models.list();
    } else {
      // Anthropic has no free listing endpoint, so this is a real request.
      // Haiku with a 10-token cap: a key check must not cost what a
      // generation costs.
      await new Anthropic({ apiKey: key }).messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      });
    }
    return { status: "valid" };
  } catch (error) {
    const label = PROVIDER_LABEL[provider];
    const status = aiErrorStatus(error);

    if (status === 401 || status === 403) {
      return {
        status: "invalid",
        message: `${label} rejected this API key. Check that you pasted it in full and that it is still active.`,
      };
    }

    return {
      status: "unknown",
      message: `Could not reach ${label} to check this key, so it was saved unverified.`,
    };
  }
}
