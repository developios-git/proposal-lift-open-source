import { describe, expect, it } from "vitest";
import {
  MAX_JOB_DESCRIPTION_CHARS,
  MAX_INSTRUCTION_LENGTH,
  MAX_SELECTION_CHARS,
  buildRefineUserPrompt,
} from "./build-refine-prompt";
import {
  MAX_UNTRUSTED_FIELD_CHARS,
  refineRequestSchema,
  refineValidationMessage,
} from "./refine-request-schema";

/** What the selection toolbar actually posts for a short highlighted phrase. */
const payload = (over: Record<string, unknown> = {}) => ({
  selection: "I will perform a disciplined Shopify audit,",
  instruction: "add experience",
  contextBefore: "x".repeat(600),
  contextAfter: "y".repeat(600),
  jobTitle: "Shopify Pre-Launch Audit and Printful Integration Check",
  jobDescription: "d".repeat(3200),
  ...over,
});

describe("refineRequestSchema", () => {
  it("accepts a job description longer than the prompt budget", () => {
    // The regression: a 43-character selection was rejected because the scraped
    // job posting exceeded a cap that only ever described prompt size.
    const parsed = refineRequestSchema.safeParse(payload());
    expect(parsed.success).toBe(true);
  });

  it("accepts a job posting far past any realistic length", () => {
    expect(
      refineRequestSchema.safeParse(
        payload({ jobDescription: "d".repeat(MAX_UNTRUSTED_FIELD_CHARS) }),
      ).success,
    ).toBe(true);
  });

  it("accepts a long job title", () => {
    expect(
      refineRequestSchema.safeParse(payload({ jobTitle: "t".repeat(1200) })).success,
    ).toBe(true);
  });

  it("accepts surrounding context past the prompt budget", () => {
    expect(
      refineRequestSchema.safeParse(
        payload({ contextBefore: "x".repeat(5000), contextAfter: "y".repeat(5000) }),
      ).success,
    ).toBe(true);
  });

  it("still bounds the request body", () => {
    expect(
      refineRequestSchema.safeParse(
        payload({ jobDescription: "d".repeat(MAX_UNTRUSTED_FIELD_CHARS + 1) }),
      ).success,
    ).toBe(false);
  });

  describe("user-facing limits still hold", () => {
    it("rejects an oversized selection", () => {
      expect(
        refineRequestSchema.safeParse(
          payload({ selection: "s".repeat(MAX_SELECTION_CHARS + 1) }),
        ).success,
      ).toBe(false);
    });

    it("rejects an oversized instruction", () => {
      expect(
        refineRequestSchema.safeParse(
          payload({ instruction: "i".repeat(MAX_INSTRUCTION_LENGTH + 1) }),
        ).success,
      ).toBe(false);
    });

    it("rejects an empty selection or instruction", () => {
      expect(refineRequestSchema.safeParse(payload({ selection: "   " })).success).toBe(
        false,
      );
      expect(
        refineRequestSchema.safeParse(payload({ instruction: "" })).success,
      ).toBe(false);
    });

    it("rejects a malformed persona id", () => {
      expect(
        refineRequestSchema.safeParse(payload({ personaId: "not-a-uuid" })).success,
      ).toBe(false);
    });
  });
});

describe("the oversized posting reaches the model, truncated", () => {
  it("keeps the prompt budget even though the schema let it through", () => {
    // The two limits doing their separate jobs: the schema admits the posting,
    // the prompt builder trims it.
    const parsed = refineRequestSchema.parse(
      payload({ jobDescription: "d".repeat(MAX_JOB_DESCRIPTION_CHARS + 1200) }),
    );
    const prompt = buildRefineUserPrompt(parsed);
    expect(prompt).toContain("d".repeat(MAX_JOB_DESCRIPTION_CHARS));
    expect(prompt).not.toContain("d".repeat(MAX_JOB_DESCRIPTION_CHARS + 1));
  });

  it("sends a typical posting in full", () => {
    const parsed = refineRequestSchema.parse(payload());
    expect(buildRefineUserPrompt(parsed)).toContain("d".repeat(3200));
  });
});

describe("refineValidationMessage", () => {
  const messageFor = (over: Record<string, unknown>) => {
    const parsed = refineRequestSchema.safeParse(payload(over));
    if (parsed.success) throw new Error("expected the payload to fail");
    return refineValidationMessage(parsed.error);
  };

  it("blames the selection only when the selection is at fault", () => {
    expect(messageFor({ selection: "s".repeat(MAX_SELECTION_CHARS + 1) })).toBe(
      "Select a shorter passage and try again.",
    );
  });

  it("asks for text when the selection is empty", () => {
    expect(messageFor({ selection: "   " })).toBe("Select some text to rewrite.");
  });

  it("names the instruction when the instruction is at fault", () => {
    expect(messageFor({ instruction: "i".repeat(MAX_INSTRUCTION_LENGTH + 1) })).toBe(
      "Shorten your instruction and try again.",
    );
  });

  it("does not blame the selection for a payload problem", () => {
    // The exact misdirection that sent a user hunting for a shorter passage.
    const message = messageFor({ personaId: "not-a-uuid" });
    expect(message).not.toMatch(/shorter passage/);
  });

  it("writes copy without em dashes", () => {
    // Surfaced verbatim in the extension toolbar.
    expect(messageFor({ selection: "   " })).not.toContain("—");
  });
});
