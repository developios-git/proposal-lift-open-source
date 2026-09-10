import { describe, expect, it } from "vitest";
import {
  hasAnyBoldChar,
  toNormal,
  toSansSerifBold,
  toggleUnicodeBold,
} from "./unicode-bold";

/**
 * These character tables are shared with the Chrome extension, which bundles
 * this module rather than keeping a copy. That makes a silent change here a
 * change in two products, so the mapping is pinned rather than assumed.
 */
describe("toSansSerifBold", () => {
  it("maps the three ranges it claims to", () => {
    expect(toSansSerifBold("AZ")).toBe("𝗔𝗭");
    expect(toSansSerifBold("az")).toBe("𝗮𝘇");
    expect(toSansSerifBold("09")).toBe("𝟬𝟵");
  });

  it("leaves everything else alone", () => {
    expect(toSansSerifBold("a-b c!é")).toBe("𝗮-𝗯 𝗰!é");
  });

  it("is a no-op on an empty string", () => {
    expect(toSansSerifBold("")).toBe("");
  });
});

describe("toNormal", () => {
  it("reverses sans-serif bold", () => {
    expect(toNormal(toSansSerifBold("Hello 42"))).toBe("Hello 42");
  });

  /**
   * Mathematical bold is the older output. Proposals written before the switch
   * still contain it, so un-bolding has to understand both or a user would be
   * unable to remove bold from their own saved text.
   */
  it("also reverses the legacy mathematical-bold range", () => {
    expect(toNormal("\u{1D400}\u{1D41A}\u{1D7CE}")).toBe("Aa0");
  });

  it("leaves normal text untouched", () => {
    expect(toNormal("Hello 42")).toBe("Hello 42");
  });
});

describe("hasAnyBoldChar", () => {
  it("is true when any character is bold, not only the first", () => {
    expect(hasAnyBoldChar("plain")).toBe(false);
    expect(hasAnyBoldChar("plain 𝗯old")).toBe(true);
    expect(hasAnyBoldChar("\u{1D400}")).toBe(true);
  });
});

describe("toggleUnicodeBold", () => {
  it("bolds a plain run and un-bolds a bold one", () => {
    expect(toggleUnicodeBold("hi")).toBe("𝗵𝗶");
    expect(toggleUnicodeBold("𝗵𝗶")).toBe("hi");
  });

  /** A partially bold run un-bolds — the whole selection follows one decision. */
  it("un-bolds a mixed run rather than bolding the rest", () => {
    expect(toggleUnicodeBold("a𝗯")).toBe("ab");
  });

  it("round-trips", () => {
    const source = "Shopify Liquid, 3 years";
    expect(toggleUnicodeBold(toggleUnicodeBold(source))).toBe(source);
  });

  /**
   * Bold characters are astral, so `.length` grows even though the visible
   * character count does not. The extension's selection toolbar re-points its
   * selection after a toggle for exactly this reason.
   */
  it("changes string length because the output is surrogate pairs", () => {
    expect("hi".length).toBe(2);
    expect(toggleUnicodeBold("hi").length).toBe(4);
    expect([...toggleUnicodeBold("hi")]).toHaveLength(2);
  });
});
