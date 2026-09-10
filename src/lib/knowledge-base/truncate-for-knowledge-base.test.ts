import { describe, expect, it } from "vitest";
import { truncateForKnowledgeBase } from "./truncate-for-knowledge-base";

describe("truncateForKnowledgeBase", () => {
  it("leaves text under the cap untouched", () => {
    expect(truncateForKnowledgeBase("Northgate Studio", 100)).toEqual({
      text: "Northgate Studio",
      truncated: false,
    });
  });

  it("treats an exactly-at-cap document as complete", () => {
    const text = "a".repeat(50);
    expect(truncateForKnowledgeBase(text, 50)).toEqual({
      text,
      truncated: false,
    });
  });

  it("cuts at the last line boundary inside the budget", () => {
    // The raw 20-character window ends mid-way through "line three", so the cut
    // falls back to the boundary before it.
    const result = truncateForKnowledgeBase(
      "line one\nline two\nline three",
      20,
    );
    expect(result.text).toBe("line one\nline two");
    expect(result.truncated).toBe(true);
  });

  it("never returns more than the cap", () => {
    const text = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    const result = truncateForKnowledgeBase(text, 100);
    expect(result.text.length).toBeLessThanOrEqual(100);
    expect(result.truncated).toBe(true);
  });

  it("hard-cuts a single line longer than the budget", () => {
    // No boundary to fall back to, so returning nothing would be worse than a
    // mid-word cut.
    const result = truncateForKnowledgeBase("a".repeat(500), 100);
    expect(result.text).toBe("a".repeat(100));
    expect(result.truncated).toBe(true);
  });

  it("hard-cuts when the only newline is at position zero", () => {
    const result = truncateForKnowledgeBase(`\n${"a".repeat(500)}`, 100);
    expect(result.text).toBe(`\n${"a".repeat(99)}`);
    expect(result.truncated).toBe(true);
  });

  it("trims trailing whitespace left by the cut", () => {
    const result = truncateForKnowledgeBase("one\n   \nlong tail here", 8);
    expect(result.text).toBe("one");
    expect(result.truncated).toBe(true);
  });

  it("handles a zero cap without throwing", () => {
    expect(truncateForKnowledgeBase("anything", 0)).toEqual({
      text: "",
      truncated: true,
    });
    expect(truncateForKnowledgeBase("", 0)).toEqual({
      text: "",
      truncated: false,
    });
  });
});
