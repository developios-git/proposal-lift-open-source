import { describe, expect, it } from "vitest";
import { qualifyCacheKey } from "./qualify-cache-key";
import { QUALIFY_PROMPT_VERSION } from "./constants";

const FILTER = "filter-abc";

describe("qualifyCacheKey", () => {
  it("is stable for the same filter and criteria", () => {
    expect(qualifyCacheKey(FILTER, "Only React work.")).toBe(
      qualifyCacheKey(FILTER, "Only React work."),
    );
  });

  it("changes when the criteria change", () => {
    expect(qualifyCacheKey(FILTER, "Only React work.")).not.toBe(
      qualifyCacheKey(FILTER, "Only Vue work."),
    );
  });

  it("ignores surrounding whitespace", () => {
    expect(qualifyCacheKey(FILTER, "  Only React work.  \n")).toBe(
      qualifyCacheKey(FILTER, "Only React work."),
    );
  });

  it("differs between filters with identical criteria", () => {
    expect(qualifyCacheKey("filter-a", "Only React work.")).not.toBe(
      qualifyCacheKey("filter-b", "Only React work."),
    );
  });

  it("is namespaced and includes the filter id", () => {
    expect(qualifyCacheKey(FILTER, "Only React work.")).toMatch(
      /^qualify:v\d+:filter-abc:/,
    );
  });

  it("carries the prompt version, so a prompt change discards old verdicts", () => {
    expect(qualifyCacheKey(FILTER, "Only React work.")).toContain(
      `:v${QUALIFY_PROMPT_VERSION}:`,
    );
  });

  it("handles empty criteria", () => {
    expect(qualifyCacheKey(FILTER, "")).toBe(qualifyCacheKey(FILTER, "   "));
  });
});
