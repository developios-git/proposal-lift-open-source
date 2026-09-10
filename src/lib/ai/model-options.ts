import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
} from "./model-catalog";

/**
 * The model choices offered at generation time: one per provider the user has
 * a key for, using the model they picked for it in Settings.
 *
 * Shared by the new-proposal page and `/api/extension/catalog`, which is the
 * point. Each built this list for itself once, and the extension's copy fell
 * behind — the panel sent no model at all, so it silently always used OpenAI
 * whatever Settings said. One builder means the web app and the extension
 * cannot disagree about what a user is allowed to generate with.
 *
 * Pure and client-safe: no `node:` imports, so the extension bundle and the
 * browser can both take it.
 */

export type ModelOption = {
  /** `"<provider>:<model>"` — both halves, so they cannot drift apart. */
  value: string;
  label: string;
};

export type ModelOptionInput = {
  /** A key is saved. Callers pass presence, never key material. */
  openaiConnected: boolean;
  openaiModel?: string | null;
  anthropicConnected: boolean;
  anthropicModel?: string | null;
};

/**
 * OpenAI sorts first: it is the required provider, so it is the better default
 * when both are configured.
 *
 * A connected provider whose model column is empty falls back to the default
 * rather than being dropped — a row can predate the user ever opening Settings,
 * and `"openai:"` with no model would reach the server as a generation request
 * with a blank model.
 */
export function buildModelOptions(input: ModelOptionInput): ModelOption[] {
  const options: ModelOption[] = [];

  if (input.openaiConnected) {
    const model = (input.openaiModel ?? "").trim() || DEFAULT_OPENAI_MODEL;
    options.push({ value: `openai:${model}`, label: `OpenAI ${model}` });
  }

  if (input.anthropicConnected) {
    const model = (input.anthropicModel ?? "").trim() || DEFAULT_ANTHROPIC_MODEL;
    options.push({
      value: `anthropic:${model}`,
      label: `Anthropic ${model}`,
    });
  }

  return options;
}

/**
 * Splits a selected option back into the pair the generation API expects.
 *
 * Returns null rather than guessing. A stored preference can outlive the option
 * that produced it — a provider disconnected, a value from an older build — and
 * defaulting an unrecognised value to OpenAI would send a request against a
 * provider the user did not choose and may not have a key for.
 */
export function parseModelOptionValue(
  value: string,
): { provider: "openai" | "anthropic"; model: string } | null {
  const separator = value.indexOf(":");
  if (separator < 0) return null;

  const provider = value.slice(0, separator).trim();
  const model = value.slice(separator + 1).trim();

  if (provider !== "openai" && provider !== "anthropic") return null;
  if (!model) return null;

  return { provider, model };
}
