import { describe, expect, it } from "vitest";
import { parseRefineResponse } from "./parse-refine-response";

describe("parseRefineResponse", () => {
  it("returns clean text unchanged", () => {
    expect(parseRefineResponse("I have shipped eight systems like this one.")).toBe(
      "I have shipped eight systems like this one.",
    );
  });

  it("returns an empty string for empty or whitespace input", () => {
    expect(parseRefineResponse("")).toBe("");
    expect(parseRefineResponse("   \n  ")).toBe("");
  });

  describe("preamble", () => {
    it.each([
      "Here's the revised version:\nThe rewritten line.",
      "Here is the rewritten excerpt:\nThe rewritten line.",
      "Sure! Here's the updated text:\nThe rewritten line.",
      "Rewritten excerpt:\nThe rewritten line.",
    ])("strips %j", (input) => {
      expect(parseRefineResponse(input)).toBe("The rewritten line.");
    });

    it("leaves a colon that is part of the content", () => {
      expect(parseRefineResponse("My approach: ship it in two phases.")).toBe(
        "My approach: ship it in two phases.",
      );
    });
  });

  describe("wrapping quotes", () => {
    it("unwraps straight double quotes", () => {
      expect(parseRefineResponse('"The rewritten line."')).toBe(
        "The rewritten line.",
      );
    });

    it("unwraps curly quotes", () => {
      expect(parseRefineResponse("“The rewritten line.”")).toBe(
        "The rewritten line.",
      );
    });

    it("keeps quotes that are part of the sentence", () => {
      const input = 'You said "ship fast" and that is what I do.';
      expect(parseRefineResponse(input)).toBe(input);
    });

    it("does not unwrap when the closing quote is internal", () => {
      const input = '"ship fast" is the brief, and I agree.';
      expect(parseRefineResponse(input)).toBe(input);
    });
  });

  describe("structure tags and fences", () => {
    it("strips hook and body tags", () => {
      expect(parseRefineResponse("<body>The rewritten line.</body>")).toBe(
        "The rewritten line.",
      );
    });

    it("unwraps a code fence", () => {
      expect(parseRefineResponse("```\nThe rewritten line.\n```")).toBe(
        "The rewritten line.",
      );
    });

    it("unwraps a language-tagged fence", () => {
      expect(parseRefineResponse("```text\nThe rewritten line.\n```")).toBe(
        "The rewritten line.",
      );
    });
  });

  describe("em dashes", () => {
    it("replaces a spaced em dash with a comma and one space", () => {
      expect(parseRefineResponse("I build fast — and I ship.")).toBe(
        "I build fast, and I ship.",
      );
    });

    it("replaces an unspaced em dash", () => {
      expect(parseRefineResponse("fast—reliable")).toBe("fast, reliable");
    });

    it("replaces en dashes too", () => {
      expect(parseRefineResponse("fast – reliable")).toBe("fast, reliable");
    });
  });

  it("handles a response with several problems at once", () => {
    const input = 'Here is the revised version:\n"<body>I ship fast — reliably.</body>"';
    expect(parseRefineResponse(input)).toBe("I ship fast, reliably.");
  });
});
