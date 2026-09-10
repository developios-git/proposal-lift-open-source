import { describe, expect, it } from "vitest";
import { buildModelOptions, parseModelOptionValue } from "./model-options";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
} from "./model-catalog";

/**
 * Both the new-proposal page and the extension catalog endpoint build this
 * list. They used to do it separately, which is how the model picker drifted
 * apart from Settings in the first place — so the interesting cases here are
 * the ones where a caller might be tempted to improvise.
 */
describe("buildModelOptions", () => {
  it("offers one option per connected provider, OpenAI first", () => {
    expect(
      buildModelOptions({
        openaiConnected: true,
        openaiModel: "gpt-5.5",
        anthropicConnected: true,
        anthropicModel: "claude-opus-5",
      }),
    ).toEqual([
      { value: "openai:gpt-5.5", label: "OpenAI gpt-5.5" },
      { value: "anthropic:claude-opus-5", label: "Anthropic claude-opus-5" },
    ]);
  });

  it("omits a provider with no key", () => {
    expect(
      buildModelOptions({
        openaiConnected: false,
        openaiModel: "gpt-5.5",
        anthropicConnected: true,
        anthropicModel: "claude-opus-5",
      }),
    ).toEqual([
      { value: "anthropic:claude-opus-5", label: "Anthropic claude-opus-5" },
    ]);
  });

  /** Nothing configured is the first-run state, not an error. */
  it("returns nothing when neither provider is connected", () => {
    expect(
      buildModelOptions({
        openaiConnected: false,
        anthropicConnected: false,
      }),
    ).toEqual([]);
  });

  /**
   * A row written before the user ever opened Settings has null model columns.
   * Falling back keeps the option usable instead of emitting `openai:`.
   */
  it("falls back to the default model when the column is empty", () => {
    const [openai, anthropic] = buildModelOptions({
      openaiConnected: true,
      openaiModel: null,
      anthropicConnected: true,
      anthropicModel: "   ",
    });
    expect(openai!.value).toBe(`openai:${DEFAULT_OPENAI_MODEL}`);
    expect(anthropic!.value).toBe(`anthropic:${DEFAULT_ANTHROPIC_MODEL}`);
  });

  it("never emits a value with an empty model half", () => {
    for (const option of buildModelOptions({
      openaiConnected: true,
      openaiModel: "",
      anthropicConnected: true,
      anthropicModel: undefined,
    })) {
      expect(option.value.split(":")[1]).toBeTruthy();
    }
  });
});

/**
 * The inverse. Encoding provider and model in one value is what stops the two
 * disagreeing, so the split has to be exact — and has to refuse anything it
 * does not recognise rather than guess a provider.
 */
describe("parseModelOptionValue", () => {
  it("splits a value produced by buildModelOptions", () => {
    const [option] = buildModelOptions({
      openaiConnected: true,
      openaiModel: "gpt-5.5-pro",
      anthropicConnected: false,
    });
    expect(parseModelOptionValue(option!.value)).toEqual({
      provider: "openai",
      model: "gpt-5.5-pro",
    });
  });

  it("round-trips both providers", () => {
    expect(parseModelOptionValue("anthropic:claude-sonnet-5")).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5",
    });
  });

  it("returns null for an empty or unselected value", () => {
    expect(parseModelOptionValue("")).toBeNull();
    expect(parseModelOptionValue("   ")).toBeNull();
  });

  it("returns null for an unknown provider rather than guessing one", () => {
    expect(parseModelOptionValue("gemini:gemini-3")).toBeNull();
    expect(parseModelOptionValue("gpt-5.5")).toBeNull();
  });

  it("returns null when the model half is missing", () => {
    expect(parseModelOptionValue("openai:")).toBeNull();
    expect(parseModelOptionValue("openai")).toBeNull();
  });
});
