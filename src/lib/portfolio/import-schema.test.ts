import { describe, expect, it } from "vitest";
import {
  extractJsonObjectSpan,
  importProjectRowSchema,
  normalizePortfolioCategoryLabel,
  sanitizeImportCategoryLabel,
} from "@/lib/portfolio/import-schema";

describe("extractJsonObjectSpan", () => {
  it("parses raw object", () => {
    const j = '{"projects":[]}';
    expect(extractJsonObjectSpan(j)).toBe(j);
  });

  it("strips markdown fences", () => {
    const inner = '{"projects":[{"name":"A","url":"https://a.com"}]}';
    const fenced = "```json\n" + inner + "\n```";
    expect(extractJsonObjectSpan(fenced)).toBe(inner);
  });

  it("extracts outer object from leading prose", () => {
    const inner = '{"projects":[]}';
    const s = "Here you go:\n" + inner + "\nHope it helps!";
    expect(extractJsonObjectSpan(s)).toBe(inner);
  });
});

describe("importProjectRowSchema", () => {
  it("treats placeholder url cells as no link", () => {
    const r = importProjectRowSchema.safeParse({
      name: "X",
      url: "N/A",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.url).toBeNull();
    const r2 = importProjectRowSchema.safeParse({ name: "Y", url: "—" });
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.data.url).toBeNull();
  });

  it("normalizes and rejects empty name", () => {
    const ok = importProjectRowSchema.safeParse({
      name: "  X  ",
      url: "https://x.com",
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.name).toBe("X");
      expect(ok.data.category).toBe("General");
    }
    const bad = importProjectRowSchema.safeParse({
      name: "   ",
      url: "https://x.com",
    });
    expect(bad.success).toBe(false);
  });

  it("allows missing url and normalizes empty string to null", () => {
    const noUrl = importProjectRowSchema.safeParse({ name: "NDA build" });
    expect(noUrl.success).toBe(true);
    if (noUrl.success) {
      expect(noUrl.data.url).toBeNull();
      expect(noUrl.data.category).toBe("General");
    }
    const emptyUrl = importProjectRowSchema.safeParse({
      name: "B",
      url: "   ",
    });
    expect(emptyUrl.success).toBe(true);
    if (emptyUrl.success) {
      expect(emptyUrl.data.url).toBeNull();
    }
    const nullUrl = importProjectRowSchema.safeParse({
      name: "C",
      url: null,
    });
    expect(nullUrl.success).toBe(true);
    if (nullUrl.success) {
      expect(nullUrl.data.url).toBeNull();
    }
  });

  it("preserves free-form category strings from import input", () => {
    const r = importProjectRowSchema.safeParse({
      name: "X",
      url: "https://x.com",
      category: "Amazon PPC",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.category).toBe("Amazon PPC");
    }
    const r2 = importProjectRowSchema.safeParse({
      name: "Y",
      category: "Catalog & listings",
    });
    expect(r2.success).toBe(true);
    if (r2.success) {
      expect(r2.data.category).toBe("Catalog & listings");
    }
  });
});

describe("normalizePortfolioCategoryLabel", () => {
  it("maps long niche labels to broad buckets", () => {
    expect(
      normalizePortfolioCategoryLabel(
        "SaaS Job Marketplace / Recruitment Platform",
      ),
    ).toBe("SaaS");
    expect(
      normalizePortfolioCategoryLabel("Service Marketplace Platform"),
    ).toBe("SaaS");
    expect(
      normalizePortfolioCategoryLabel(
        "SaaS Marketplace (B2B Design Consulting Platform)",
      ),
    ).toBe("SaaS");
    expect(
      normalizePortfolioCategoryLabel("AI SaaS / Interview Preparation Tool"),
    ).toBe("SaaS");
  });
});

describe("sanitizeImportCategoryLabel", () => {
  it("defaults empty and trims / collapses whitespace", () => {
    expect(sanitizeImportCategoryLabel(null)).toBe("General");
    expect(sanitizeImportCategoryLabel("")).toBe("General");
    expect(sanitizeImportCategoryLabel("   ")).toBe("General");
    expect(sanitizeImportCategoryLabel("  A  \n B  ")).toBe("A B");
  });
});
