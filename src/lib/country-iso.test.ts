import { describe, expect, it } from "vitest";
import {
  iso2ForCanonical,
  normalizeJobCountryToCanonical,
} from "./country-filter";

/** Mirrors the resolution `<CountryFlag>` performs. */
function iso2(raw: string | null | undefined): string | null {
  const canonical = normalizeJobCountryToCanonical(raw);
  return canonical ? iso2ForCanonical(canonical) : null;
}

describe("country resolution for flags", () => {
  it("resolves alpha-3 codes, which is what Upwork sends", () => {
    expect(iso2("AUS")).toBe("AU");
    expect(iso2("USA")).toBe("US");
    expect(iso2("GBR")).toBe("GB");
    expect(iso2("IND")).toBe("IN");
    expect(iso2("BRA")).toBe("BR");
  });

  it("resolves the alpha-3 codes the substring fallback used to miss", () => {
    // "germany" does not contain "deu", so these silently produced no flag.
    expect(iso2("DEU")).toBe("DE");
    expect(iso2("PHL")).toBe("PH");
    expect(iso2("CHE")).toBe("CH");
    expect(iso2("NLD")).toBe("NL");
    expect(iso2("ESP")).toBe("ES");
    expect(iso2("POL")).toBe("PL");
    expect(iso2("ZAF")).toBe("ZA");
    expect(iso2("KOR")).toBe("KR");
    expect(iso2("ARE")).toBe("AE");
    expect(iso2("VNM")).toBe("VN");
  });

  it("resolves full names", () => {
    expect(iso2("United States")).toBe("US");
    expect(iso2("Germany")).toBe("DE");
    expect(iso2("United Kingdom")).toBe("GB");
  });

  it("resolves alpha-2 codes", () => {
    expect(iso2("US")).toBe("US");
    expect(iso2("DE")).toBe("DE");
    expect(iso2("AU")).toBe("AU");
  });

  it("is case and whitespace insensitive", () => {
    expect(iso2("  aus  ")).toBe("AU");
    expect(iso2("deu")).toBe("DE");
    expect(iso2("united states")).toBe("US");
  });

  it("returns null for unresolvable input", () => {
    expect(iso2(null)).toBeNull();
    expect(iso2(undefined)).toBeNull();
    expect(iso2("")).toBeNull();
    expect(iso2("   ")).toBeNull();
    expect(iso2("Atlantis")).toBeNull();
  });

  it("gives every alpha-3 in the map a resolvable alpha-2", () => {
    // Guards against a typo'd canonical name silently yielding no flag.
    const alpha3 = [
      "AFG", "DZA", "ARG", "ARM", "AUS", "AUT", "AZE", "BGD", "BLR", "BEL",
      "BOL", "BRA", "BGR", "KHM", "CAN", "CHL", "CHN", "COL", "CRI", "HRV",
      "CYP", "CZE", "DNK", "DOM", "ECU", "EGY", "EST", "ETH", "FIN", "FRA",
      "GEO", "DEU", "GHA", "GRC", "HKG", "HUN", "ISL", "IND", "IDN", "IRN",
      "IRQ", "IRL", "ISR", "ITA", "JAM", "JPN", "KAZ", "KEN", "LAO", "LVA",
      "LTU", "LUX", "MYS", "MLT", "MEX", "MDA", "MAR", "MMR", "NPL", "NLD",
      "NZL", "NGA", "NOR", "PAK", "PAN", "PRY", "PER", "PHL", "POL", "PRT",
      "QAT", "ROU", "RUS", "SAU", "SRB", "SGP", "SVK", "SVN", "ZAF", "KOR",
      "ESP", "LKA", "SWE", "CHE", "TWN", "TZA", "THA", "TTO", "TUN", "TUR",
      "UGA", "UKR", "ARE", "GBR", "USA", "URY", "UZB", "VEN", "VNM",
    ];
    const unresolved = alpha3.filter((c) => iso2(c) === null);
    expect(unresolved).toEqual([]);
  });
});
