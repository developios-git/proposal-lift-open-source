import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type AIProvider = "openai" | "anthropic";

export type AIFailureCode =
  | "invalid_api_key"
  | "provider_quota"
  | "provider_unavailable"
  | "generation_failed";

export type AIFailure = {
  /** Shown to the user verbatim. */
  message: string;
  /** Lets the client branch without matching on prose. */
  code: AIFailureCode;
  /** The status this app answers with, not the one the provider sent. */
  status: number;
};

export const PROVIDER_LABEL: Record<AIProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

/**
 * Classifies a provider's HTTP status into something the user can act on.
 *
 * Split out from `describeAIFailure` so the rules can be exercised without
 * constructing SDK error objects. The three cases below are the ones a
 * self-hoster can actually do something about, and they are the three that
 * happen: the key is wrong, the account has no credit left, or the provider is
 * down. Anything else falls through to the caller's own message.
 *
 * Note what is deliberately absent from the first case: "please try again".
 * Retrying a rejected key fails identically, forever, and telling someone to
 * retry is how a configuration problem gets mistaken for a broken app.
 */
export function classifyAIHttpStatus(
  status: number | undefined,
  provider: AIProvider,
  fallbackMessage: string,
): AIFailure {
  const label = PROVIDER_LABEL[provider];

  if (status === 401 || status === 403) {
    return {
      message: `${label} rejected your API key. Check it in Settings, under AI Models.`,
      code: "invalid_api_key",
      status: 400,
    };
  }

  if (status === 429) {
    return {
      // 429 covers both "too fast" and "out of credit". The second is far more
      // common on a personal key, and is the one that needs acting on.
      message: `${label} refused the request: your account is out of quota or being rate limited. Check your usage and billing with ${label}, then try again.`,
      code: "provider_quota",
      status: 429,
    };
  }

  if (status !== undefined && status >= 500) {
    return {
      message: `${label} is unavailable right now. Try again in a moment.`,
      code: "provider_unavailable",
      status: 502,
    };
  }

  return { message: fallbackMessage, code: "generation_failed", status: 500 };
}

/** The HTTP status behind an SDK error, or undefined for anything else. */
export function aiErrorStatus(error: unknown): number | undefined {
  if (error instanceof OpenAI.APIError) return error.status;
  if (error instanceof Anthropic.APIError) return error.status;
  return undefined;
}

/**
 * Turns an OpenAI or Anthropic SDK error into something the user can act on.
 *
 * Both SDKs are handled here on purpose. An earlier OpenAI-only version meant a
 * rejected *Anthropic* key fell through to the generic message even on the one
 * route that classified OpenAI properly.
 *
 * The SDK's own message is never forwarded: OpenAI's 401 text embeds a fragment
 * of the user's key, which has no business reaching a browser.
 */
export function describeAIFailure(
  error: unknown,
  provider: AIProvider,
  fallbackMessage: string,
): AIFailure {
  return classifyAIHttpStatus(aiErrorStatus(error), provider, fallbackMessage);
}
