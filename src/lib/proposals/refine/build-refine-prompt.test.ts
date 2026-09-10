import { describe, expect, it } from "vitest";
import {
  MAX_CONTEXT_CHARS,
  MAX_INSTRUCTION_LENGTH,
  MAX_JOB_DESCRIPTION_CHARS,
  MAX_KNOWLEDGE_BASE_CHARS,
  MAX_PERSONA_CHARS,
  MAX_PORTFOLIO_CHARS,
  MAX_SELECTION_CHARS,
  buildRefineSystemPrompt,
  buildRefineUserPrompt,
} from "./build-refine-prompt";

describe("buildRefineSystemPrompt", () => {
  const prompt = buildRefineSystemPrompt();

  it("demands the excerpt only, with no preamble or wrapper", () => {
    expect(prompt).toMatch(/only the rewritten excerpt/i);
    expect(prompt).toMatch(/no preamble/i);
    expect(prompt).toMatch(/quotation marks/i);
  });

  describe("fact policy", () => {
    it("permits facts from the profile, knowledge base and portfolio", () => {
      expect(prompt).toMatch(/WRITER PROFILE/);
      expect(prompt).toMatch(/KNOWLEDGE BASE/);
      expect(prompt).toMatch(/PORTFOLIO PROJECTS/);
      expect(prompt).toMatch(/may use facts/i);
    });

    it("still forbids inventing anything outside those sources", () => {
      expect(prompt).toMatch(/never invent anything outside those four/i);
    });

    it("tells the model to omit rather than fabricate a missing detail", () => {
      // The load-bearing half of the rule. Without it, "make this more specific"
      // against a thin persona invites a fabricated credential.
      expect(prompt).toMatch(
        /rewrite without that detail rather than inventing one/i,
      );
    });
  });

  describe("portfolio policy", () => {
    it("keeps projects out unless the instruction asks", () => {
      expect(prompt).toMatch(
        /only mention a portfolio project if the instruction asks/i,
      );
    });

    it("forbids altering or inventing a project URL", () => {
      expect(prompt).toMatch(/never alter a url/i);
      expect(prompt).toMatch(/never invent one/i);
    });

    it("defines the failure mode as omission, not substitution", () => {
      // The anti-fabrication guard: asking for Shopify with no Shopify project
      // must not yield a confident WordPress link in a live proposal.
      expect(prompt).toMatch(
        /rather than substituting one that does not fit/i,
      );
    });
  });

  it("constrains length drift", () => {
    expect(prompt).toMatch(/25%/);
  });

  it("marks the job posting and surrounding text as read-only", () => {
    expect(prompt).toMatch(/context only/i);
    expect(prompt).toMatch(/do not rewrite them/i);
    expect(prompt).toMatch(/do not answer them/i);
  });
});

describe("buildRefineUserPrompt", () => {
  const base = {
    selection: "I have experience building similar systems.",
    instruction: "make it more concrete",
  };

  it("includes the excerpt and the instruction", () => {
    const prompt = buildRefineUserPrompt(base);
    expect(prompt).toContain("I have experience building similar systems.");
    expect(prompt).toContain("make it more concrete");
    expect(prompt).toContain("=== EXCERPT TO REWRITE ===");
  });

  it("omits every optional section when absent", () => {
    const prompt = buildRefineUserPrompt(base);
    for (const heading of [
      "WRITER PROFILE",
      "KNOWLEDGE BASE",
      "PORTFOLIO PROJECTS",
      "JOB POSTING",
      "BEFORE THE EXCERPT",
      "AFTER THE EXCERPT",
    ]) {
      expect(prompt).not.toContain(heading);
    }
  });

  it("omits optional sections that are only whitespace", () => {
    const prompt = buildRefineUserPrompt({
      ...base,
      personaContext: "   ",
      knowledgeBase: "\n\n",
      contextBefore: "  ",
      jobDescription: "\t",
    });
    expect(prompt).not.toContain("WRITER PROFILE");
    expect(prompt).not.toContain("KNOWLEDGE BASE");
    expect(prompt).not.toContain("BEFORE THE EXCERPT");
    expect(prompt).not.toContain("JOB POSTING");
  });

  describe("fact sources", () => {
    const withFacts = {
      ...base,
      personaContext: "Name: Alex\nYears of experience: 8",
      knowledgeBase: "We specialise in Supabase migrations.",
    };

    it("includes both when supplied", () => {
      const prompt = buildRefineUserPrompt(withFacts);
      expect(prompt).toContain("Years of experience: 8");
      expect(prompt).toContain("We specialise in Supabase migrations.");
    });

    it("labels them as usable, distinctly from context-only sections", () => {
      const prompt = buildRefineUserPrompt({
        ...withFacts,
        jobTitle: "Build a dashboard",
      });
      expect(prompt).toContain("=== WRITER PROFILE (facts you may use) ===");
      expect(prompt).toContain("=== KNOWLEDGE BASE (facts you may use) ===");
      expect(prompt).toContain("=== JOB POSTING (context only) ===");
    });

    it("puts the fact sources before the excerpt", () => {
      const prompt = buildRefineUserPrompt(withFacts);
      const persona = prompt.indexOf("WRITER PROFILE");
      const kb = prompt.indexOf("KNOWLEDGE BASE");
      const excerpt = prompt.indexOf("=== EXCERPT TO REWRITE ===");
      expect(persona).toBeLessThan(kb);
      expect(kb).toBeLessThan(excerpt);
    });

    describe("portfolio catalog", () => {
      const withCatalog = {
        ...withFacts,
        portfolioCatalog: "- Acme Storefront | Shopify | https://acme.example.com",
        jobTitle: "Build a store",
      };

      it("renders as a usable fact source", () => {
        const prompt = buildRefineUserPrompt(withCatalog);
        expect(prompt).toContain("=== PORTFOLIO PROJECTS (facts you may use) ===");
        expect(prompt).toContain("Acme Storefront");
      });

      it("sits between the knowledge base and the job posting", () => {
        const prompt = buildRefineUserPrompt(withCatalog);
        const kb = prompt.indexOf("KNOWLEDGE BASE");
        const portfolio = prompt.indexOf("PORTFOLIO PROJECTS");
        const job = prompt.indexOf("JOB POSTING");
        expect(kb).toBeLessThan(portfolio);
        expect(portfolio).toBeLessThan(job);
      });

      it("is omitted when empty", () => {
        expect(
          buildRefineUserPrompt({ ...withFacts, portfolioCatalog: "" }),
        ).not.toContain("PORTFOLIO PROJECTS");
      });
    });

    it("works with only one of the two present", () => {
      const personaOnly = buildRefineUserPrompt({
        ...base,
        personaContext: "Name: Alex",
      });
      expect(personaOnly).toContain("WRITER PROFILE");
      expect(personaOnly).not.toContain("KNOWLEDGE BASE");

      const kbOnly = buildRefineUserPrompt({
        ...base,
        knowledgeBase: "We ship fast.",
      });
      expect(kbOnly).toContain("KNOWLEDGE BASE");
      expect(kbOnly).not.toContain("WRITER PROFILE");
    });
  });

  it("keeps the excerpt between the before and after context", () => {
    const prompt = buildRefineUserPrompt({
      ...base,
      contextBefore: "BEFORE_MARKER",
      contextAfter: "AFTER_MARKER",
    });
    const before = prompt.indexOf("BEFORE_MARKER");
    const excerpt = prompt.indexOf("I have experience");
    const after = prompt.indexOf("AFTER_MARKER");
    expect(before).toBeLessThan(excerpt);
    expect(excerpt).toBeLessThan(after);
  });

  describe("truncation", () => {
    const overflows = (field: string, max: number, char: string) => {
      const prompt = buildRefineUserPrompt({
        ...base,
        [field]: char.repeat(max + 500),
      });
      expect(prompt).toContain(char.repeat(max));
      expect(prompt).not.toContain(char.repeat(max + 1));
    };

    it("caps the selection", () =>
      overflows("selection", MAX_SELECTION_CHARS, "x"));
    it("caps the persona", () => overflows("personaContext", MAX_PERSONA_CHARS, "p"));
    it("caps the knowledge base", () =>
      overflows("knowledgeBase", MAX_KNOWLEDGE_BASE_CHARS, "k"));
    it("caps the job description", () =>
      overflows("jobDescription", MAX_JOB_DESCRIPTION_CHARS, "q"));
    it("caps the portfolio catalog", () =>
      overflows("portfolioCatalog", MAX_PORTFOLIO_CHARS, "f"));
    it("caps the instruction", () =>
      overflows("instruction", MAX_INSTRUCTION_LENGTH, "i"));

    it("caps each context side", () => {
      const prompt = buildRefineUserPrompt({
        ...base,
        contextBefore: "y".repeat(MAX_CONTEXT_CHARS + 200),
        contextAfter: "z".repeat(MAX_CONTEXT_CHARS + 200),
      });
      expect(prompt).not.toContain("y".repeat(MAX_CONTEXT_CHARS + 1));
      expect(prompt).not.toContain("z".repeat(MAX_CONTEXT_CHARS + 1));
    });
  });
});
