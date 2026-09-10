import { describe, expect, it } from "vitest";
import { parseQualifyResponse } from "./parse-qualify-response";
import { QUALIFY_REASON_MAX_LENGTH } from "./constants";

describe("parseQualifyResponse", () => {
  it("parses a well-formed qualified verdict", () => {
    const out = parseQualifyResponse(
      '{"verdict":"qualified","reason":"Budget is $3,000 and the stack is Next.js.","unverifiable":[]}',
    );
    expect(out).toEqual({
      verdict: "qualified",
      reason: "Budget is $3,000 and the stack is Next.js.",
      unverifiable: [],
    });
  });

  it("parses the unverifiable list", () => {
    const out = parseQualifyResponse(
      JSON.stringify({
        verdict: "qualified",
        reason: "Stack matches.",
        unverifiable: ["Client must have 4 reviews", "  Client must be in the US  "],
      }),
    );
    expect(out?.unverifiable).toEqual([
      "Client must have 4 reviews",
      "Client must be in the US",
    ]);
  });

  it("defaults unverifiable to an empty list when absent", () => {
    const out = parseQualifyResponse(
      '{"verdict":"qualified","reason":"Stack matches."}',
    );
    expect(out?.unverifiable).toEqual([]);
  });

  it("degrades a malformed unverifiable rather than failing the verdict", () => {
    // The verdict is still usable, so a bad side-field must not discard it.
    for (const bad of ['"nope"', "123", "null", '{"a":1}']) {
      const out = parseQualifyResponse(
        `{"verdict":"qualified","reason":"Stack matches.","unverifiable":${bad}}`,
      );
      expect(out?.verdict).toBe("qualified");
      expect(out?.unverifiable).toEqual([]);
    }
  });

  it("drops non-string and blank entries", () => {
    const out = parseQualifyResponse(
      JSON.stringify({
        verdict: "disqualified",
        reason: "WordPress excluded.",
        unverifiable: ["Real one", 42, null, "   ", { a: 1 }],
      }),
    );
    expect(out?.unverifiable).toEqual(["Real one"]);
  });

  it("caps a runaway unverifiable list", () => {
    const out = parseQualifyResponse(
      JSON.stringify({
        verdict: "qualified",
        reason: "Stack matches.",
        unverifiable: Array.from({ length: 40 }, (_, i) => `rule ${i}`),
      }),
    );
    expect(out?.unverifiable).toHaveLength(10);
  });

  it("parses a disqualified verdict", () => {
    const out = parseQualifyResponse(
      '{"verdict":"disqualified","reason":"WordPress work is excluded."}',
    );
    expect(out?.verdict).toBe("disqualified");
  });

  it("unwraps a json code fence", () => {
    const out = parseQualifyResponse(
      '```json\n{"verdict":"qualified","reason":"Matches React."}\n```',
    );
    expect(out?.verdict).toBe("qualified");
  });

  it("unwraps a bare code fence", () => {
    const out = parseQualifyResponse(
      '```\n{"verdict":"qualified","reason":"Matches React."}\n```',
    );
    expect(out?.verdict).toBe("qualified");
  });

  it("accepts a differently cased verdict", () => {
    const out = parseQualifyResponse(
      '{"verdict":"Qualified","reason":"Matches React."}',
    );
    expect(out?.verdict).toBe("qualified");
  });

  it("truncates an over-long reason with an ellipsis", () => {
    const long = "a".repeat(QUALIFY_REASON_MAX_LENGTH + 50);
    const out = parseQualifyResponse(
      JSON.stringify({ verdict: "qualified", reason: long }),
    );
    expect(out?.reason).toHaveLength(QUALIFY_REASON_MAX_LENGTH);
    expect(out?.reason.endsWith("…")).toBe(true);
  });

  it("rejects an unknown verdict", () => {
    expect(
      parseQualifyResponse('{"verdict":"maybe","reason":"Not sure."}'),
    ).toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parseQualifyResponse('{"verdict":"qualified"')).toBeNull();
  });

  it("rejects a missing reason", () => {
    expect(parseQualifyResponse('{"verdict":"qualified"}')).toBeNull();
  });

  it("rejects an empty reason", () => {
    expect(
      parseQualifyResponse('{"verdict":"qualified","reason":"   "}'),
    ).toBeNull();
  });

  it("rejects a non-object payload", () => {
    expect(parseQualifyResponse('["qualified"]')).toBeNull();
    expect(parseQualifyResponse('"qualified"')).toBeNull();
    expect(parseQualifyResponse("null")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(parseQualifyResponse("")).toBeNull();
    expect(parseQualifyResponse("   ")).toBeNull();
  });
});
