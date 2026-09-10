import { describe, expect, it } from "vitest";
import {
  COMPACT_MAX_PROJECTS,
  FULL_DETAIL_MAX_PROJECTS,
  MAX_PROJECT_DESCRIPTION_CHARS,
  type PortfolioCatalogProject,
  buildPortfolioCatalog,
} from "./build-portfolio-catalog";
import { MAX_PORTFOLIO_CHARS } from "./build-refine-prompt";

const project = (
  over: Partial<PortfolioCatalogProject> = {},
): PortfolioCatalogProject => ({
  name: "Acme Storefront",
  category: "Shopify",
  url: "https://acme.example.com",
  description: "Rebuilt a 12k-SKU store and cut checkout time 40%.",
  technologies: ["Liquid", "React"],
  ...over,
});

const many = (count: number) =>
  Array.from({ length: count }, (_, i) => project({ name: `Project ${i}` }));

describe("buildPortfolioCatalog", () => {
  it("returns an empty string for no projects", () => {
    expect(buildPortfolioCatalog([])).toBe("");
  });

  it("renders name, category, technologies and url on one line", () => {
    expect(buildPortfolioCatalog([project()])).toContain(
      "- Acme Storefront | Shopify | Liquid, React | https://acme.example.com",
    );
  });

  describe("full-detail tier", () => {
    it("includes the description at or below the threshold", () => {
      const catalog = buildPortfolioCatalog(many(FULL_DETAIL_MAX_PROJECTS));
      expect(catalog).toContain("Rebuilt a 12k-SKU store");
    });

    it("truncates a long description", () => {
      const catalog = buildPortfolioCatalog([
        project({ description: "d".repeat(MAX_PROJECT_DESCRIPTION_CHARS + 200) }),
      ]);
      expect(catalog).toContain("d".repeat(MAX_PROJECT_DESCRIPTION_CHARS));
      expect(catalog).not.toContain("d".repeat(MAX_PROJECT_DESCRIPTION_CHARS + 1));
    });

    it("collapses newlines so an entry cannot span extra lines", () => {
      const catalog = buildPortfolioCatalog([
        project({ description: "line one\nline two" }),
      ]);
      expect(catalog).toContain("line one line two");
      expect(catalog.split("\n")).toHaveLength(2);
    });
  });

  describe("compact tier", () => {
    const catalog = buildPortfolioCatalog(many(FULL_DETAIL_MAX_PROJECTS + 1));

    it("drops descriptions above the threshold", () => {
      expect(catalog).not.toContain("Rebuilt a 12k-SKU store");
    });

    it("keeps one line per project so more of them fit", () => {
      expect(catalog.split("\n")).toHaveLength(FULL_DETAIL_MAX_PROJECTS + 1);
    });
  });

  it("caps the project count independently of the caller", () => {
    const catalog = buildPortfolioCatalog(many(COMPACT_MAX_PROJECTS + 25));
    expect(catalog.split("\n")).toHaveLength(COMPACT_MAX_PROJECTS);
  });

  it("stays within the character guard, dropping whole entries only", () => {
    const catalog = buildPortfolioCatalog(
      Array.from({ length: 60 }, (_, i) =>
        project({ name: `${i}-${"n".repeat(400)}` }),
      ),
    );
    expect(catalog.length).toBeLessThanOrEqual(MAX_PORTFOLIO_CHARS);
    // Every surviving line is a complete entry.
    for (const line of catalog.split("\n")) {
      expect(line.startsWith("- ")).toBe(true);
    }
  });

  it("renders projects with missing optional fields without artifacts", () => {
    const catalog = buildPortfolioCatalog([
      project({ url: null, description: null, technologies: null, category: null }),
    ]);
    expect(catalog).toBe("- Acme Storefront");
    expect(catalog).not.toContain("|");
  });

  it("skips a project with no usable name", () => {
    const catalog = buildPortfolioCatalog([project({ name: "  " }), project()]);
    expect(catalog.split("\n")[0]).toContain("Acme Storefront");
    expect(catalog.startsWith("- Acme Storefront")).toBe(true);
  });
});
