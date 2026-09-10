import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_BASE_SECTIONS,
  KNOWLEDGE_BASE_STRUCTURE_SYSTEM_PROMPT,
  buildStructureUserPrompt,
} from "./structure-prompt";
import { KNOWLEDGE_BASE_EXAMPLES } from "./examples";

describe("KNOWLEDGE_BASE_STRUCTURE_SYSTEM_PROMPT", () => {
  it("names every section of the skeleton", () => {
    for (const heading of KNOWLEDGE_BASE_SECTIONS) {
      expect(KNOWLEDGE_BASE_STRUCTURE_SYSTEM_PROMPT).toContain(heading);
    }
  });

  it("uses the same headings the starter examples use", () => {
    // If these drift apart, an imported knowledge base and an inserted example
    // stop looking like the same kind of document.
    const exampleHeadings = new Set(
      KNOWLEDGE_BASE_EXAMPLES.flatMap((example) =>
        example.text.split("\n").filter((line) => line.startsWith("## ")),
      ),
    );
    // The examples use "Who we are" or "Who I am" depending on voice, so match
    // on the shared stem rather than the exact line.
    const stems = new Set(
      [...exampleHeadings].map((h) => h.replace(/\b(we|I)\b/g, "*")),
    );
    for (const heading of KNOWLEDGE_BASE_SECTIONS) {
      expect(stems).toContain(heading.replace(/\b(we|I)\b/g, "*"));
    }
  });

  it("forbids inventing facts, which is the failure that matters", () => {
    expect(KNOWLEDGE_BASE_STRUCTURE_SYSTEM_PROMPT).toMatch(
      /never invent or estimate/i,
    );
    expect(KNOWLEDGE_BASE_STRUCTURE_SYSTEM_PROMPT).toMatch(
      /only facts that appear in the source/i,
    );
  });

  it("tells the model to omit unsupported sections rather than fill them", () => {
    expect(KNOWLEDGE_BASE_STRUCTURE_SYSTEM_PROMPT).toMatch(
      /leave that section out/i,
    );
  });

  it("tells the model to keep the source's own voice", () => {
    expect(KNOWLEDGE_BASE_STRUCTURE_SYSTEM_PROMPT).toMatch(/"we"/);
    expect(KNOWLEDGE_BASE_STRUCTURE_SYSTEM_PROMPT).toMatch(/"I"/);
  });

  it("asks for bare markdown with no fences or preamble", () => {
    expect(KNOWLEDGE_BASE_STRUCTURE_SYSTEM_PROMPT).toMatch(/no preamble/i);
    expect(KNOWLEDGE_BASE_STRUCTURE_SYSTEM_PROMPT).toMatch(/no code fences/i);
  });

  it("uses no em dashes", () => {
    expect(KNOWLEDGE_BASE_STRUCTURE_SYSTEM_PROMPT).not.toContain("—");
  });
});

describe("buildStructureUserPrompt", () => {
  it("embeds the source text verbatim between delimiters", () => {
    const source = "Northgate Studio\nWe build Shopify storefronts.";
    const prompt = buildStructureUserPrompt(source);
    expect(prompt).toContain(source);
    expect(prompt.indexOf("--- BEGIN DOCUMENT ---")).toBeLessThan(
      prompt.indexOf(source),
    );
    expect(prompt.indexOf(source)).toBeLessThan(
      prompt.indexOf("--- END DOCUMENT ---"),
    );
  });

  it("restates the use-only-what-is-here constraint", () => {
    expect(buildStructureUserPrompt("x")).toMatch(/only what is written here/i);
  });

  it("uses no em dashes", () => {
    expect(buildStructureUserPrompt("x")).not.toContain("—");
  });

  it("does not choke on markdown or delimiters inside the source", () => {
    const source = "## Heading\n--- END DOCUMENT ---\n```js\ncode\n```";
    expect(buildStructureUserPrompt(source)).toContain(source);
  });
});
