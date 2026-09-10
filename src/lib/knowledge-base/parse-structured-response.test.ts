import { describe, expect, it } from "vitest";
import { parseStructuredKnowledgeBase } from "./parse-structured-response";

const MARKDOWN = "## Who we are\nNorthgate Studio builds Shopify storefronts.";

describe("parseStructuredKnowledgeBase", () => {
  it("passes clean markdown through unchanged", () => {
    expect(parseStructuredKnowledgeBase(MARKDOWN)).toBe(MARKDOWN);
  });

  it("trims surrounding whitespace", () => {
    expect(parseStructuredKnowledgeBase(`\n\n  ${MARKDOWN}  \n\n`)).toBe(
      MARKDOWN,
    );
  });

  it("strips a wrapping fence with a language tag", () => {
    expect(parseStructuredKnowledgeBase("```markdown\n" + MARKDOWN + "\n```")).toBe(
      MARKDOWN,
    );
    expect(parseStructuredKnowledgeBase("```md\n" + MARKDOWN + "\n```")).toBe(
      MARKDOWN,
    );
  });

  it("strips a bare wrapping fence", () => {
    expect(parseStructuredKnowledgeBase("```\n" + MARKDOWN + "\n```")).toBe(
      MARKDOWN,
    );
  });

  it("keeps a fence that is part of the content rather than wrapping it", () => {
    // A knowledge base can legitimately contain a code sample. Only a fence that
    // wraps the entire response is the model ignoring the format instruction.
    const withCode = "## How we work\nWe run:\n\n```bash\nnpm test\n```\n\nOn every push.";
    expect(parseStructuredKnowledgeBase(withCode)).toBe(withCode);
  });

  it("returns null for nothing usable", () => {
    expect(parseStructuredKnowledgeBase("")).toBeNull();
    expect(parseStructuredKnowledgeBase("   ")).toBeNull();
    expect(parseStructuredKnowledgeBase("\n\n\t")).toBeNull();
  });

  it("returns null for an empty fence", () => {
    // The route refunds on null, which is the right outcome for a model that
    // returned only formatting.
    expect(parseStructuredKnowledgeBase("```\n\n```")).toBeNull();
    expect(parseStructuredKnowledgeBase("```markdown\n \n```")).toBeNull();
  });
});
