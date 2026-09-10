import { describe, expect, it } from "vitest";
import { QUALIFY_CRITERIA_EXAMPLES } from "./criteria-examples";
import { QUALIFY_CRITERIA_MAX_LENGTH } from "./constants";

describe("QUALIFY_CRITERIA_EXAMPLES", () => {
  it("offers the three documented starting points", () => {
    expect(QUALIFY_CRITERIA_EXAMPLES.map((e) => e.id)).toEqual([
      "comprehensive",
      "skills",
      "budget",
    ]);
  });

  it("uses unique ids, since they key the selection state", () => {
    const ids = QUALIFY_CRITERIA_EXAMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(QUALIFY_CRITERIA_EXAMPLES)(
    "$id fits the criteria field",
    (example) => {
      // The textarea has maxLength={QUALIFY_CRITERIA_MAX_LENGTH} and Save is
      // disabled over it. An example longer than the cap would insert text the
      // user cannot then save — the one failure this data file can cause.
      expect(example.text.length).toBeLessThanOrEqual(
        QUALIFY_CRITERIA_MAX_LENGTH,
      );
    },
  );

  it.each(QUALIFY_CRITERIA_EXAMPLES)("$id is presentable", (example) => {
    expect(example.title.trim()).not.toBe("");
    expect(example.description.trim()).not.toBe("");
    // Leading or trailing whitespace would land in the textarea verbatim.
    expect(example.text).toBe(example.text.trim());
  });

  it.each(QUALIFY_CRITERIA_EXAMPLES)(
    "$id gives the qualifier something to check",
    (example) => {
      expect(example.text).toContain("QUALIFY IF:");
    },
  );

  it.each(QUALIFY_CRITERIA_EXAMPLES)(
    "$id carries no unfilled placeholders",
    (example) => {
      // A surviving "[your stack]" would reach the model literally.
      expect(example.text).not.toMatch(/\[[^\]]+\]/);
    },
  );
});
