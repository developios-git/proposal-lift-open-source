import { describe, expect, it } from "vitest";
import {
  parseCsvToRows,
  parsePortfolioCsv,
} from "@/lib/portfolio/parse-portfolio-csv";

describe("parseCsvToRows", () => {
  it("handles quoted fields and commas inside quotes", () => {
    const rows = parseCsvToRows(`a,b\n"hello, world",x`);
    expect(rows).toEqual([
      ["a", "b"],
      ["hello, world", "x"],
    ]);
  });

  it("strips UTF-8 BOM", () => {
    const rows = parseCsvToRows("\uFEFFname,url\nx,");
    expect(rows[0]).toEqual(["name", "url"]);
  });
});

describe("parsePortfolioCsv", () => {
  it("parses template-shaped CSV into project objects", () => {
    const csv = `name,url,description,technologies,category
Acme,https://acme.example,"Store build",Next.js|SaaS,E-commerce
Internal,,NDA CRM work,React,saas`;
    const r = parsePortfolioCsv(csv);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.projects).toHaveLength(2);
      expect(r.projects[0]).toMatchObject({
        name: "Acme",
        url: "https://acme.example",
        description: "Store build",
        technologies: ["Next.js", "SaaS"],
        category: "E-commerce",
      });
      expect(r.projects[1]).toMatchObject({
        name: "Internal",
        description: "NDA CRM work",
      });
      expect(
        (r.projects[1] as Record<string, unknown>).url,
      ).toBeUndefined();
    }
  });

  it("rejects CSV without name column", () => {
    const r = parsePortfolioCsv("foo,bar\n1,2");
    expect(r.ok).toBe(false);
  });

  it("rejects unknown columns", () => {
    const r = parsePortfolioCsv("name,badcol\na,b");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Unknown column");
  });
});
