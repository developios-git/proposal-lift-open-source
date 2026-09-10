/**
 * Decides whether a refine instruction is asking for portfolio work, which of
 * the tenant's projects it points at, and whether the finished rewrite actually
 * used one.
 *
 * The gate is why the portfolio is not in every refine prompt. Sending the
 * project list only when it was asked for keeps an ordinary "make this shorter"
 * prompt as small as it is today, and it is a harder guarantee than a prompt
 * rule: the model cannot volunteer a link to work it was never shown.
 *
 * Categories are free text. `projects_category_check` was dropped in
 * 20250312000000_portfolio_categories.sql and `sanitizeImportCategoryLabel`
 * preserves whatever the user wrote, so the match vocabulary is built from the
 * tenant's own rows. Nothing here may hardcode a category taxonomy — a fixed
 * alias list would silently fail for every user who labels work differently.
 */

import type { PortfolioCatalogProject } from "./build-portfolio-catalog";

export type PortfolioVocabulary = {
  categories: string[];
  technologies: string[];
};

export type PortfolioIntent = {
  /** True when the instruction asks for portfolio work in any form. */
  wanted: boolean;
  /** Tenant category labels named in the instruction. */
  matchedCategories: string[];
  /** Tenant technology tags named in the instruction. */
  matchedTechnologies: string[];
};

/**
 * Phrases that ask for a project without naming a kind. This is English
 * phrasing rather than taxonomy, which is why it is the one fixed list here.
 */
const GENERIC_TRIGGERS = [
  "project",
  "projects",
  "portfolio",
  "portfolios",
  "example",
  "examples",
  "case study",
  "case studies",
  "past work",
  "previous work",
  "work sample",
  "work samples",
  "built",
  "showcase",
  "proof",
];

/**
 * Default buckets, not things a user asks for. `sanitizeImportCategoryLabel`
 * assigns "General" to anything blank, so without this the phrase "in general"
 * would match most portfolios.
 */
const VOCABULARY_STOPLIST = new Set([
  "general",
  "other",
  "others",
  "misc",
  "miscellaneous",
  "uncategorized",
  "uncategorised",
  "none",
  "n/a",
]);

/** Below this a term matches too much to be a useful signal. */
const MIN_VOCABULARY_TERM_CHARS = 3;
/** Guards against a pathological tag list turning into thousands of regexes. */
const MAX_VOCABULARY_TERMS = 200;

function normalize(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsableTerm(term: string): boolean {
  return (
    term.length >= MIN_VOCABULARY_TERM_CHARS &&
    !VOCABULARY_STOPLIST.has(term.toLowerCase())
  );
}

/** Case-insensitive dedupe that keeps the first spelling seen. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_VOCABULARY_TERMS) break;
  }
  return out;
}

export function buildPortfolioVocabulary(
  projects: PortfolioCatalogProject[],
): PortfolioVocabulary {
  const categories: string[] = [];
  const technologies: string[] = [];

  for (const project of projects) {
    const category = normalize(project.category);
    if (isUsableTerm(category)) categories.push(category);

    for (const raw of project.technologies ?? []) {
      const tech = normalize(raw);
      if (isUsableTerm(tech)) technologies.push(tech);
    }
  }

  return { categories: dedupe(categories), technologies: dedupe(technologies) };
}

function toWordPattern(term: string): RegExp {
  // Terms are user-authored, so they can contain regex metacharacters
  // ("Node.js", "C++", "UI/UX").
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu");
}

const GENERIC_PATTERNS = GENERIC_TRIGGERS.map(toWordPattern);

function matches(text: string, term: string): boolean {
  return toWordPattern(term).test(text);
}

export function detectPortfolioIntent(
  instruction: string | null | undefined,
  vocabulary: PortfolioVocabulary,
): PortfolioIntent {
  const text = normalize(instruction);
  if (!text) {
    return { wanted: false, matchedCategories: [], matchedTechnologies: [] };
  }

  const matchedCategories = vocabulary.categories.filter((term) =>
    matches(text, term),
  );
  const matchedTechnologies = vocabulary.technologies.filter((term) =>
    matches(text, term),
  );

  // A named category or technology is a strong enough signal on its own:
  // "lean harder on my Shopify experience" wants those rows even without the
  // word "project".
  const wanted =
    matchedCategories.length > 0 ||
    matchedTechnologies.length > 0 ||
    GENERIC_PATTERNS.some((pattern) => pattern.test(text));

  return { wanted, matchedCategories, matchedTechnologies };
}

/**
 * The projects worth showing the model.
 *
 * With no matched terms the whole list passes through, so a generic "add a
 * relevant example" still offers everything. Because matched terms are drawn
 * from these same rows, a non-empty match can never return an empty list.
 */
export function selectPortfolioCandidates(
  projects: PortfolioCatalogProject[],
  intent: PortfolioIntent,
): PortfolioCatalogProject[] {
  const terms = [...intent.matchedCategories, ...intent.matchedTechnologies];
  if (terms.length === 0) return projects;

  const wanted = new Set(terms.map((term) => term.toLowerCase()));

  return projects.filter((project) => {
    if (wanted.has(normalize(project.category).toLowerCase())) return true;
    for (const raw of project.technologies ?? []) {
      if (wanted.has(normalize(raw).toLowerCase())) return true;
    }
    const name = normalize(project.name);
    return terms.some((term) => matches(name, term));
  });
}

/**
 * The note shown in the toolbar, judged against what the model actually
 * produced rather than against what we hoped it would find.
 *
 * Free text categories mean an empty query result can no longer prove "you have
 * no Shopify project", so this checks the finished rewrite for any name or URL
 * we supplied. That covers every reason a project was left out, not just the
 * category case.
 */
export function buildPortfolioNotice(opts: {
  intent: PortfolioIntent;
  candidates: PortfolioCatalogProject[];
  rewrittenText: string;
}): string | undefined {
  const { intent, candidates, rewrittenText } = opts;
  if (!intent.wanted) return undefined;

  if (candidates.length === 0) {
    return "No portfolio projects saved yet, so this rewrite leaves out any example.";
  }

  const used = candidates.some((project) => {
    const url = normalize(project.url);
    if (url && rewrittenText.includes(url)) return true;
    const name = normalize(project.name);
    return Boolean(name) && rewrittenText.includes(name);
  });
  if (used) return undefined;

  return "No matching project was found in your portfolio, so this rewrite leaves one out.";
}
