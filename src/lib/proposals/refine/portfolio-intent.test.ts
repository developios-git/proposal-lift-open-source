import { describe, expect, it } from "vitest";
import type { PortfolioCatalogProject } from "./build-portfolio-catalog";
import {
  buildPortfolioNotice,
  buildPortfolioVocabulary,
  detectPortfolioIntent,
  selectPortfolioCandidates,
} from "./portfolio-intent";

const project = (
  over: Partial<PortfolioCatalogProject> = {},
): PortfolioCatalogProject => ({
  name: "Acme Storefront",
  category: "Shopify",
  url: "https://acme.example.com",
  description: "Rebuilt a 12k-SKU store.",
  technologies: ["Liquid", "React"],
  ...over,
});

const vocabularyOf = (projects: PortfolioCatalogProject[]) =>
  buildPortfolioVocabulary(projects);

describe("buildPortfolioVocabulary", () => {
  it("draws terms from the tenant's own rows, not a fixed taxonomy", () => {
    const vocab = vocabularyOf([
      project({ category: "Discord Bots", technologies: ["Pycord"] }),
    ]);
    expect(vocab.categories).toEqual(["Discord Bots"]);
    expect(vocab.technologies).toEqual(["Pycord"]);
  });

  it("dedupes case-insensitively, keeping the first spelling", () => {
    const vocab = vocabularyOf([
      project({ category: "Shopify", technologies: ["React"] }),
      project({ category: "shopify", technologies: ["REACT"] }),
    ]);
    expect(vocab.categories).toEqual(["Shopify"]);
    expect(vocab.technologies).toEqual(["React"]);
  });

  it("drops the default buckets so 'in general' cannot match", () => {
    // sanitizeImportCategoryLabel assigns "General" to anything blank, so this
    // bucket appears in most portfolios and carries no intent.
    const vocab = vocabularyOf([
      project({ category: "General" }),
      project({ category: "Other" }),
      project({ category: "Uncategorized" }),
    ]);
    expect(vocab.categories).toEqual([]);
  });

  it("drops terms too short to be a useful signal", () => {
    const vocab = vocabularyOf([
      project({ category: "AI", technologies: ["Go", "Rust"] }),
    ]);
    expect(vocab.categories).toEqual([]);
    expect(vocab.technologies).toEqual(["Rust"]);
  });

  it("tolerates null and empty fields", () => {
    const vocab = vocabularyOf([
      project({ category: null, technologies: null }),
      project({ category: "   ", technologies: ["", "  "] }),
    ]);
    expect(vocab.categories).toEqual([]);
    expect(vocab.technologies).toEqual([]);
  });
});

describe("detectPortfolioIntent", () => {
  const vocab = vocabularyOf([
    project({ category: "Shopify", technologies: ["Liquid", "Node.js"] }),
    project({ category: "WordPress", technologies: ["PHP"] }),
  ]);

  it("fires on a generic ask with no category named", () => {
    const intent = detectPortfolioIntent("add a relevant example", vocab);
    expect(intent.wanted).toBe(true);
    expect(intent.matchedCategories).toEqual([]);
  });

  it("matches a category the tenant actually has", () => {
    const intent = detectPortfolioIntent("give me a shopify project", vocab);
    expect(intent.wanted).toBe(true);
    expect(intent.matchedCategories).toEqual(["Shopify"]);
  });

  it("does not match a category the tenant does not have", () => {
    // The whole point of building the vocabulary from the tenant's rows.
    const intent = detectPortfolioIntent("give me a webflow project", vocab);
    expect(intent.matchedCategories).toEqual([]);
    expect(intent.wanted).toBe(true); // "project" still fired
  });

  it("fires on a bare category mention with no generic trigger", () => {
    const intent = detectPortfolioIntent("lean harder on my Shopify work", vocab);
    expect(intent.wanted).toBe(true);
    expect(intent.matchedCategories).toEqual(["Shopify"]);
  });

  it("matches technologies as well as categories", () => {
    const intent = detectPortfolioIntent("mention something in PHP", vocab);
    expect(intent.wanted).toBe(true);
    expect(intent.matchedTechnologies).toEqual(["PHP"]);
  });

  it("handles regex metacharacters in user-authored terms", () => {
    const intent = detectPortfolioIntent("show the Node.js one", vocab);
    expect(intent.matchedTechnologies).toEqual(["Node.js"]);
  });

  it("stays quiet on an ordinary rewrite instruction", () => {
    for (const instruction of [
      "make this shorter",
      "punch up the opening",
      "fix the grammar",
    ]) {
      expect(detectPortfolioIntent(instruction, vocab).wanted).toBe(false);
    }
  });

  it("respects word boundaries", () => {
    // "projected" must not trigger on "project".
    expect(detectPortfolioIntent("tighten the projected revenue line", vocab).wanted).toBe(
      false,
    );
  });

  it("is case-insensitive", () => {
    expect(detectPortfolioIntent("GIVE ME A SHOPIFY PROJECT", vocab).matchedCategories).toEqual(
      ["Shopify"],
    );
  });

  it("returns not-wanted for empty input", () => {
    expect(detectPortfolioIntent("", vocab).wanted).toBe(false);
    expect(detectPortfolioIntent(null, vocab).wanted).toBe(false);
    expect(detectPortfolioIntent("   ", vocab).wanted).toBe(false);
  });
});

describe("selectPortfolioCandidates", () => {
  const shopify = project({ name: "Acme Storefront", category: "Shopify" });
  const wp = project({
    name: "Bell Blog",
    category: "WordPress",
    technologies: ["PHP"],
  });
  const projects = [shopify, wp];
  const vocab = vocabularyOf(projects);

  it("narrows to the matched category", () => {
    const intent = detectPortfolioIntent("a shopify project", vocab);
    expect(selectPortfolioCandidates(projects, intent)).toEqual([shopify]);
  });

  it("narrows on a matched technology", () => {
    const intent = detectPortfolioIntent("something in PHP", vocab);
    expect(selectPortfolioCandidates(projects, intent)).toEqual([wp]);
  });

  it("passes everything through when nothing was named", () => {
    const intent = detectPortfolioIntent("add a relevant example", vocab);
    expect(selectPortfolioCandidates(projects, intent)).toEqual(projects);
  });

  it("never returns empty for a non-empty match", () => {
    // Matched terms come from these same rows, so this is structural.
    const intent = detectPortfolioIntent("shopify and PHP work", vocab);
    expect(selectPortfolioCandidates(projects, intent).length).toBeGreaterThan(0);
  });

  it("matches on the project name too", () => {
    const named = [project({ name: "Klaviyo Migration", category: "Email" })];
    const intent = detectPortfolioIntent(
      "reuse the Klaviyo Migration project",
      vocabularyOf(named),
    );
    expect(selectPortfolioCandidates(named, intent)).toEqual(named);
  });
});

describe("buildPortfolioNotice", () => {
  const candidates = [project()];
  const wanted = { wanted: true, matchedCategories: [], matchedTechnologies: [] };

  it("stays silent when no project was asked for", () => {
    expect(
      buildPortfolioNotice({
        intent: { wanted: false, matchedCategories: [], matchedTechnologies: [] },
        candidates: [],
        rewrittenText: "anything",
      }),
    ).toBeUndefined();
  });

  it("reports an empty portfolio", () => {
    expect(
      buildPortfolioNotice({ intent: wanted, candidates: [], rewrittenText: "x" }),
    ).toMatch(/No portfolio projects saved yet/);
  });

  it("stays silent when the rewrite used a project URL", () => {
    expect(
      buildPortfolioNotice({
        intent: wanted,
        candidates,
        rewrittenText: "See https://acme.example.com for a close match.",
      }),
    ).toBeUndefined();
  });

  it("stays silent when the rewrite used a project name", () => {
    expect(
      buildPortfolioNotice({
        intent: wanted,
        candidates,
        rewrittenText: "Acme Storefront is the closest fit.",
      }),
    ).toBeUndefined();
  });

  it("speaks up when the rewrite referenced nothing we supplied", () => {
    expect(
      buildPortfolioNotice({
        intent: wanted,
        candidates,
        rewrittenText: "I have relevant experience.",
      }),
    ).toMatch(/No matching project was found/);
  });

  it("writes copy without em dashes", () => {
    // Rendered in the extension toolbar, so it follows the frontend copy rule.
    const notices = [
      buildPortfolioNotice({ intent: wanted, candidates: [], rewrittenText: "" }),
      buildPortfolioNotice({ intent: wanted, candidates, rewrittenText: "" }),
    ];
    for (const notice of notices) expect(notice).not.toContain("—");
  });
});
