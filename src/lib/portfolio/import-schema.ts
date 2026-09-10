import { z } from "zod";

const MAX_PROJECTS_PER_IMPORT = 100;
const MAX_IMPORT_CATEGORY_CHARS = 200;

/**
 * Preserve user-authored category strings from CSV/JSON/import (trim, collapse whitespace, cap length).
 * Empty values become "General" so projects always attach to a category row.
 */
export function sanitizeImportCategoryLabel(
  input: string | null | undefined,
): string {
  if (input == null) return "General";
  const s = String(input).replace(/\s+/g, " ").trim();
  if (s === "") return "General";
  if (s.length <= MAX_IMPORT_CATEGORY_CHARS) return s;
  return s.slice(0, MAX_IMPORT_CATEGORY_CHARS).trimEnd() || "General";
}

/** Normalize pasted/prose category text to a short, high-level bucket for filters and imports. */
function simplifyCategoryForMatching(input: string): string {
  return input
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CATEGORY_ALIASES = new Map<string, string>([
  ["general", "General"],
  ["saas", "SaaS"],
  ["web app", "Web App"],
  ["webapp", "Web App"],
  ["website", "Web App"],
  ["e-commerce", "E-commerce"],
  ["ecommerce", "E-commerce"],
  ["e commerce", "E-commerce"],
  ["mobile app", "Mobile App"],
  ["mobile", "Mobile App"],
  ["wordpress", "WordPress"],
  ["shopify", "Shopify"],
  ["design", "Design"],
  ["figma", "Figma"],
  ["headless cms", "Headless CMS"],
  ["headless", "Headless CMS"],
  ["webflow", "Webflow"],
  ["other", "General"],
]);

/**
 * Maps long or niche labels (e.g. "SaaS Job Marketplace / Recruitment") to broad
 * portfolio buckets. Kept for callers that need legacy bucketing; CSV/JSON import
 * uses {@link sanitizeImportCategoryLabel} instead.
 */
export function normalizePortfolioCategoryLabel(
  input: string | null | undefined,
): string {
  if (input == null || String(input).trim() === "") {
    return "General";
  }
  const s = simplifyCategoryForMatching(String(input));
  if (!s) return "General";

  const direct = CATEGORY_ALIASES.get(s);
  if (direct) return direct;

  const rules: { test: (x: string) => boolean; out: string }[] = [
    { test: (x) => x.includes("figma"), out: "Figma" },
    { test: (x) => x.includes("shopify"), out: "Shopify" },
    {
      test: (x) => x.includes("wordpress") || x.includes("elementor"),
      out: "WordPress",
    },
    { test: (x) => x.includes("webflow"), out: "Webflow" },
    {
      test: (x) =>
        x.includes("headless") ||
        x.includes("strapi") ||
        x.includes("sanity") ||
        x.includes("contentful"),
      out: "Headless CMS",
    },
    {
      test: (x) =>
        /woo\s*commerce|woocommerce|magento|bigcommerce|ecwid|prestashop/.test(
          x,
        ),
      out: "E-commerce",
    },
    {
      test: (x) =>
        x.includes("e-commerce") ||
        x.includes("ecommerce") ||
        x.includes("e commerce"),
      out: "E-commerce",
    },
    {
      test: (x) =>
        x.includes("react native") ||
        x.includes("flutter") ||
        /\bios\b/.test(x) ||
        (x.includes("android") &&
          (x.includes("app") || x.includes("mobile"))) ||
        x.includes("mobile app"),
      out: "Mobile App",
    },
    {
      test: (x) =>
        x.includes("saas") ||
        x.includes("marketplace") ||
        x.includes("job board") ||
        x.includes("recruitment") ||
        x.includes("interview preparation") ||
        x.includes("interview prep"),
      out: "SaaS",
    },
    {
      test: (x) =>
        x.includes("design") ||
        x.includes("ui/ux") ||
        x.includes("ux/ui") ||
        x.includes("prototyping"),
      out: "Design",
    },
    {
      test: (x) =>
        x.includes("web app") ||
        x.includes("webapp") ||
        x.includes("website") ||
        x.includes("landing") ||
        x.includes("dashboard") ||
        x.includes("portal") ||
        x.includes("platform"),
      out: "Web App",
    },
    {
      test: (x) =>
        x.includes("api") || x.includes("backend") || x.includes("microservice"),
      out: "Web App",
    },
  ];

  for (const { test, out } of rules) {
    if (test(s)) return out;
  }

  return "General";
}

/** Strips ``` or ```json fences often added by ChatGPT. */
function stripJsonMarkdownFences(raw: string): string {
  let s = raw.trim();
  const fenceMatch = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/m.exec(s);
  if (fenceMatch) {
    s = fenceMatch[1].trim();
  }
  return s;
}

/**
 * If the model adds prose, take the outermost `{ ... }` span.
 */
export function extractJsonObjectSpan(raw: string): string {
  const stripped = stripJsonMarkdownFences(raw);
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first !== -1 && last > first) {
    return stripped.slice(first, last + 1);
  }
  return stripped;
}

/** Treats empty cells and common "no link" placeholders as no URL (avoids failing URL validation). */
function coercePortfolioUrl(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (raw === "") return null;
  const lower = raw.toLowerCase();
  if (
    /^(n\/?a|n\/a\.?|none|no\s*url|null|nil|-{1,3}|—|–|\.{3}|tbd|pending)$/i.test(
      lower,
    )
  ) {
    return null;
  }
  return raw;
}

export const importProjectRowSchema = z
  .object({
    name: z.string(),
    url: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    technologies: z.array(z.union([z.string(), z.number()])).optional(),
    category: z.union([z.string(), z.null()]).optional(),
    image: z.union([z.string(), z.null()]).optional(),
    featured: z.boolean().optional(),
    upworkPortfolioItemId: z.string().optional(),
  })
  .transform((row) => {
    const technologies = (row.technologies ?? [])
      .map((t) => String(t).trim())
      .filter(Boolean);
    const url = coercePortfolioUrl(
      row.url === null || row.url === undefined ? null : String(row.url),
    );
    return {
      name: row.name.trim(),
      url,
      description:
        row.description === null || row.description === undefined
          ? null
          : String(row.description).trim() || null,
      technologies,
      category: sanitizeImportCategoryLabel(row.category),
      imageUrl:
        row.image === null || row.image === undefined
          ? null
          : String(row.image).trim() || null,
      featured: row.featured ?? false,
      upworkPortfolioItemId: row.upworkPortfolioItemId,
    };
  })
  .superRefine((row, ctx) => {
    if (!row.name) {
      ctx.addIssue({ code: "custom", message: "name is required", path: ["name"] });
    }
  });

export { MAX_PROJECTS_PER_IMPORT };
