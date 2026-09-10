/**
 * How hard a model should work on a request.
 *
 * This replaced `temperature`, which both providers have been retiring. Sending
 * it to `claude-sonnet-5` returns `400 invalid_request_error: 'temperature' is
 * deprecated for this model` — six of the eight Claude models the settings
 * dropdown offers reject it — and on the OpenAI side it had been commented out
 * of the request for so long that the settings slider controlled nothing at all.
 *
 * Effort is the current equivalent and is real on both: OpenAI takes
 * `reasoning.effort`, Anthropic takes `output_config.effort`. Unlike
 * temperature it is a cost/quality dial rather than a variance one, which on a
 * bring-your-own-key app is the more useful thing to hand the user anyway.
 */

/**
 * Only three levels, deliberately.
 *
 * Both installed SDKs type more than this — OpenAI accepts `none` through
 * `max`, Anthropic `low` through `max` — but per-model support is narrower than
 * per-SDK support. `xhigh` arrived with Claude Opus 4.7, so offering it would
 * break `claude-opus-4-6`, which is above our floor and therefore selectable.
 * These three are valid on every model both floors admit.
 */
export const AI_EFFORT_VALUES = ["low", "medium", "high"] as const;

export type AiEffort = (typeof AI_EFFORT_VALUES)[number];

export const DEFAULT_AI_EFFORT: AiEffort = "medium";

/**
 * Coerces a stored or submitted value into a level a provider will accept.
 *
 * This is the only validation the value ever gets. `/api/settings` copies
 * whitelisted fields from the request body into the update untouched — no
 * schema, no range check — so the column can hold anything a request put there,
 * including a leftover `0.7` from before the temperature columns were dropped.
 * Whatever comes out goes straight to a provider, where a bad value fails the
 * generation rather than the save.
 *
 * Never throws: an unusable setting should quietly fall back to a working
 * default, not take down a proposal the user is halfway through writing.
 */
export function normalizeEffort(value: unknown): AiEffort {
  if (typeof value !== "string") return DEFAULT_AI_EFFORT;

  const normalized = value.trim().toLowerCase();
  return (AI_EFFORT_VALUES as readonly string[]).includes(normalized)
    ? (normalized as AiEffort)
    : DEFAULT_AI_EFFORT;
}
