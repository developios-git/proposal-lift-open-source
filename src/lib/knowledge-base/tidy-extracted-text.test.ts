import { describe, expect, it } from "vitest";
import { tidyExtractedText } from "./tidy-extracted-text";

const NBSP = String.fromCharCode(0x00a0);
const EM_SPACE = String.fromCharCode(0x2003);
const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const SOFT_HYPHEN = String.fromCharCode(0x00ad);
const BOM = String.fromCharCode(0xfeff);

describe("tidyExtractedText", () => {
  it("normalises line endings", () => {
    expect(tidyExtractedText("one\r\ntwo\rthree")).toBe("one\ntwo\nthree");
  });

  it("folds unicode spaces to an ordinary space", () => {
    expect(tidyExtractedText(`a${NBSP}b`)).toBe("a b");
    expect(tidyExtractedText(`a${EM_SPACE}b`)).toBe("a b");
    expect(tidyExtractedText(`a${IDEOGRAPHIC_SPACE}b`)).toBe("a b");
  });

  it("deletes zero-width and formatting characters", () => {
    expect(tidyExtractedText(`${BOM}Nor${ZERO_WIDTH_SPACE}thgate`)).toBe(
      "Northgate",
    );
    expect(tidyExtractedText(`develop${SOFT_HYPHEN}ment`)).toBe("development");
  });

  it("treats a folded unicode space as part of a collapsible run", () => {
    // NBSP becomes a space first, so `a<NBSP> b` is a two-space run and
    // collapses like any other.
    expect(tidyExtractedText(`a${NBSP} b`)).toBe("a b");
  });

  describe("hyphenation", () => {
    it("rejoins a word split across a line break", () => {
      expect(tidyExtractedText("develop-\nment")).toBe("development");
      expect(tidyExtractedText("develop- \n  ment")).toBe("development");
    });

    it("leaves a genuine compound alone", () => {
      // The hyphen is mid-line here, not at the break.
      expect(tidyExtractedText("well-known\nfact")).toBe("well-known\nfact");
    });

    it("leaves a capitalised continuation alone", () => {
      // A capital after a break is far more likely a new heading than the tail
      // of a split word.
      expect(tidyExtractedText("TODO-\nNOTE")).toBe("TODO-\nNOTE");
      expect(tidyExtractedText("scope-\nNotes")).toBe("scope-\nNotes");
    });

    it("does not rejoin across a blank line", () => {
      expect(tidyExtractedText("develop-\n\nment")).toBe("develop-\n\nment");
    });
  });

  describe("page markers", () => {
    it("drops a line that is only a page number", () => {
      expect(tidyExtractedText("Results\n12\nMore results")).toBe(
        "Results\n\nMore results",
      );
    });

    it("drops 'Page N' and 'Page N of M'", () => {
      expect(tidyExtractedText("Results\nPage 3\nMore")).toBe(
        "Results\n\nMore",
      );
      expect(tidyExtractedText("Results\nPage 3 of 12\nMore")).toBe(
        "Results\n\nMore",
      );
      expect(tidyExtractedText("Results\npage 3 of 12\nMore")).toBe(
        "Results\n\nMore",
      );
    });

    it("keeps a number that is part of a sentence", () => {
      expect(tidyExtractedText("We shipped 12 projects")).toBe(
        "We shipped 12 projects",
      );
      expect(tidyExtractedText("12 projects")).toBe("12 projects");
    });

    it("keeps a numbered list item", () => {
      expect(tidyExtractedText("1. Discovery\n2. Build")).toBe(
        "1. Discovery\n2. Build",
      );
    });

    it("keeps a number longer than a plausible page count", () => {
      expect(tidyExtractedText("Revenue\n120000\nUSD")).toBe(
        "Revenue\n120000\nUSD",
      );
    });
  });

  describe("whitespace", () => {
    it("collapses interior runs of spaces", () => {
      expect(tidyExtractedText("Northgate    Studio")).toBe("Northgate Studio");
      expect(tidyExtractedText("a\t\tb")).toBe("a b");
    });

    it("preserves leading indentation so nested lists survive", () => {
      expect(tidyExtractedText("- one\n  - nested")).toBe("- one\n  - nested");
    });

    it("strips trailing whitespace per line", () => {
      expect(tidyExtractedText("one   \ntwo\t")).toBe("one\ntwo");
    });

    it("collapses two or more blank lines to one", () => {
      expect(tidyExtractedText("a\n\n\nb")).toBe("a\n\nb");
      expect(tidyExtractedText("a\n\n\n\n\n\nb")).toBe("a\n\nb");
    });

    it("keeps a single blank line as a paragraph break", () => {
      expect(tidyExtractedText("a\n\nb")).toBe("a\n\nb");
    });

    it("trims the whole document", () => {
      expect(tidyExtractedText("\n\n  Northgate  \n\n")).toBe("Northgate");
    });

    it("returns an empty string for empty or whitespace-only input", () => {
      expect(tidyExtractedText("")).toBe("");
      expect(tidyExtractedText("   ")).toBe("");
      expect(tidyExtractedText("\n\n\n")).toBe("");
      expect(tidyExtractedText(`${NBSP}${ZERO_WIDTH_SPACE}`)).toBe("");
    });

    it("returns an empty string for a document that was only page markers", () => {
      expect(tidyExtractedText("1\n2\n3")).toBe("");
    });
  });

  it("is idempotent", () => {
    // A second pass runs over already-tidied text whenever a user re-imports,
    // so it must be a no-op rather than eroding the document further.
    const messy = [
      "\r\n  Northgate   Studio  \r\n",
      "Page 1 of 4",
      "",
      "",
      "",
      "We build head-",
      "less commerce storefronts.",
      "  - Shopify",
      "    - Hydrogen",
      "12",
    ].join("\n");

    const once = tidyExtractedText(messy);
    expect(tidyExtractedText(once)).toBe(once);
    expect(once).toBe(
      [
        "Northgate Studio",
        "",
        "We build headless commerce storefronts.",
        "  - Shopify",
        "    - Hydrogen",
      ].join("\n"),
    );
  });
});
