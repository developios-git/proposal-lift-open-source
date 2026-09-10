import { describe, expect, it } from "vitest";
import {
  baseModelId,
  dedupeModelIds,
  isChatModelId,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  MIN_ANTHROPIC_VERSION,
  MIN_OPENAI_GPT_VERSION,
} from "./model-catalog";

/**
 * `isChatModelId` is the whole reason this module exists: OpenAI's
 * `models.list()` returns everything the key can reach — embeddings, speech,
 * transcription, image, moderation, fine-tunes, and every GPT generation ever
 * shipped — with no field saying which of them can hold a conversation, and no
 * field saying which are still worth offering.
 */
describe("isChatModelId", () => {
  it("keeps GPT models at or above the floor", () => {
    for (const id of [
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
    ]) {
      expect(isChatModelId("openai", id)).toBe(true);
    }
  });

  /**
   * The floor is the point: these are all real, all chat-capable, and all
   * superseded. Before it, the settings dropdown ran to fifty-odd entries.
   */
  it("drops GPT generations below the floor", () => {
    for (const id of [
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "gpt-5.4-pro",
      "gpt-5.3-chat-latest",
      "gpt-5.3-codex",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-4o",
      "gpt-4.1-mini",
    ]) {
      expect(isChatModelId("openai", id)).toBe(false);
    }
  });

  /**
   * The o-series carries no version comparable to a GPT generation, and every
   * released member predates the floor, so it is excluded wholesale.
   */
  it("drops the o-series reasoning models", () => {
    for (const id of ["o1", "o3", "o4-mini"]) {
      expect(isChatModelId("openai", id)).toBe(false);
    }
  });

  it("drops the non-conversational OpenAI models", () => {
    for (const id of [
      "text-embedding-3-small",
      "text-embedding-3-large",
      "whisper-1",
      "tts-1",
      "dall-e-3",
      "gpt-image-1",
      "omni-moderation-latest",
      "babbage-002",
      "davinci-002",
    ]) {
      expect(isChatModelId("openai", id)).toBe(false);
    }
  });

  /**
   * These pass the version test but speak a different protocol — audio in,
   * audio out, a websocket session, a hosted search — so a chat request against
   * them fails.
   */
  it("drops above-floor models that are not chat completions", () => {
    for (const id of [
      "gpt-5.5-audio-preview",
      "gpt-5.6-realtime-preview",
      "gpt-5.5-transcribe",
      "gpt-5.5-mini-tts",
      "gpt-5.6-search-preview",
    ]) {
      expect(isChatModelId("openai", id)).toBe(false);
    }
  });

  it("drops fine-tuned models, whatever they are derived from", () => {
    expect(isChatModelId("openai", "ft:gpt-5.5-2026-04-23:acme::AbC123")).toBe(
      false,
    );
  });

  /** A dated snapshot is still a real model; `dedupeModelIds` collapses it. */
  it("keeps dated snapshots of an above-floor model", () => {
    expect(isChatModelId("openai", "gpt-5.5-pro-2026-04-23")).toBe(true);
    expect(isChatModelId("anthropic", "claude-opus-4-6-20260101")).toBe(true);
  });

  it("keeps Anthropic models at or above the floor", () => {
    for (const id of [
      "claude-opus-4-6",
      "claude-opus-4-7",
      "claude-opus-4-8",
      "claude-opus-5",
      "claude-sonnet-4-6",
      "claude-sonnet-5",
      "claude-fable-5",
      "claude-fable-5-1",
    ]) {
      expect(isChatModelId("anthropic", id)).toBe(true);
    }
  });

  /**
   * 4-5 is the generation Anthropic publishes only as pinned snapshots, so the
   * floor is what clears those dated ids out of the dropdown.
   */
  it("drops Claude generations below the floor", () => {
    for (const id of [
      "claude-haiku-4-5-20251001",
      "claude-opus-4-5-20251101",
      "claude-sonnet-4-5-20250929",
      "claude-sonnet-4-5",
    ]) {
      expect(isChatModelId("anthropic", id)).toBe(false);
    }
  });

  /** Pre-4 ids put the version before the family and parse to nothing. */
  it("drops the legacy claude-3 naming", () => {
    expect(isChatModelId("anthropic", "claude-3-5-sonnet-20241022")).toBe(false);
    expect(isChatModelId("anthropic", "claude-3-opus-20240229")).toBe(false);
  });

  it("rejects a non-Claude id under Anthropic", () => {
    expect(isChatModelId("anthropic", "gpt-5.5")).toBe(false);
  });

  it("does not accept an OpenAI id under Anthropic, or the reverse", () => {
    expect(isChatModelId("openai", "claude-sonnet-5")).toBe(false);
    expect(isChatModelId("anthropic", "o3")).toBe(false);
  });

  it("ignores surrounding whitespace and case", () => {
    expect(isChatModelId("openai", "  GPT-5.5-Pro  ")).toBe(true);
    expect(isChatModelId("openai", "  WHISPER-1 ")).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(isChatModelId("openai", "")).toBe(false);
    expect(isChatModelId("anthropic", "   ")).toBe(false);
  });
});

describe("baseModelId", () => {
  it("strips both providers' snapshot spellings", () => {
    expect(baseModelId("gpt-5.5-pro-2026-04-23")).toBe("gpt-5.5-pro");
    expect(baseModelId("claude-sonnet-4-5-20250929")).toBe("claude-sonnet-4-5");
  });

  it("leaves an undated id alone", () => {
    expect(baseModelId("gpt-5.5-pro")).toBe("gpt-5.5-pro");
    expect(baseModelId("claude-opus-4-8")).toBe("claude-opus-4-8");
  });

  /**
   * `claude-opus-4-8` ends in digits but is a version, not a date. Stripping it
   * would merge every 4.x release into one entry.
   */
  it("does not mistake a version suffix for a date", () => {
    expect(baseModelId("claude-haiku-4-5")).toBe("claude-haiku-4-5");
    expect(baseModelId("gpt-5.5")).toBe("gpt-5.5");
  });
});

describe("dedupeModelIds", () => {
  it("prefers the floating id over its snapshots", () => {
    expect(
      dedupeModelIds([
        "gpt-5.5-pro",
        "gpt-5.5-pro-2026-04-23",
        "gpt-5.5-pro-2026-01-05",
      ]),
    ).toEqual(["gpt-5.5-pro"]);
  });

  /** Hiding the group entirely would deny access to a usable model. */
  it("keeps the newest snapshot when no floating id is published", () => {
    expect(
      dedupeModelIds([
        "claude-sonnet-4-5-20250929",
        "claude-sonnet-4-5-20250101",
      ]),
    ).toEqual(["claude-sonnet-4-5-20250929"]);
  });

  it("never merges distinct versions", () => {
    const ids = ["claude-opus-4-6", "claude-opus-4-7", "claude-opus-4-8"];
    expect(dedupeModelIds(ids)).toEqual(ids);
  });

  /** Same version number, different family — two models, not a duplicate. */
  it("never merges across families", () => {
    expect(dedupeModelIds(["claude-opus-5", "claude-sonnet-5"])).toEqual([
      "claude-opus-5",
      "claude-sonnet-5",
    ]);
  });

  it("is a no-op on an already-clean list, and handles an empty one", () => {
    expect(dedupeModelIds(["gpt-5.5", "gpt-5.6-sol"])).toEqual([
      "gpt-5.5",
      "gpt-5.6-sol",
    ]);
    expect(dedupeModelIds([])).toEqual([]);
  });
});

/**
 * A default the filter rejects would leave every new user, and every
 * `generate.ts` fallback, pointing at a model the dropdown does not offer.
 */
describe("the defaults satisfy their own filter", () => {
  it("offers DEFAULT_OPENAI_MODEL, at or above the floor", () => {
    expect(isChatModelId("openai", DEFAULT_OPENAI_MODEL)).toBe(true);
    expect(Number.parseFloat(DEFAULT_OPENAI_MODEL.replace("gpt-", ""))).
      toBeGreaterThanOrEqual(MIN_OPENAI_GPT_VERSION);
  });

  it("offers DEFAULT_ANTHROPIC_MODEL, at or above the floor", () => {
    expect(isChatModelId("anthropic", DEFAULT_ANTHROPIC_MODEL)).toBe(true);
    expect(MIN_ANTHROPIC_VERSION).toBeLessThanOrEqual(5);
  });
});
