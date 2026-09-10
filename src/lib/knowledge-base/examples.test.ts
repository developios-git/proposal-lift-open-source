import { describe, expect, it } from "vitest";
import { KNOWLEDGE_BASE_EXAMPLES } from "./examples";
import {
  KNOWLEDGE_BASE_EXAMPLE_MAX_LENGTH,
  KNOWLEDGE_BASE_EXAMPLE_MIN_LENGTH,
} from "./constants";

describe("KNOWLEDGE_BASE_EXAMPLES", () => {
  it("offers the six documented starting points in order", () => {
    expect(KNOWLEDGE_BASE_EXAMPLES.map((e) => e.id)).toEqual([
      "dev-agency",
      "solo-freelancer",
      "design-studio",
      "marketing-agency",
      "content-writer",
      "video-editor",
    ]);
  });

  it("uses unique ids, since they key the dialog's selection state", () => {
    const ids = KNOWLEDGE_BASE_EXAMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(KNOWLEDGE_BASE_EXAMPLES)("$id is presentable", (example) => {
    expect(example.title.trim()).not.toBe("");
    expect(example.description.trim()).not.toBe("");
    // Leading or trailing whitespace would land in the textarea verbatim.
    expect(example.text).toBe(example.text.trim());
  });

  it.each(KNOWLEDGE_BASE_EXAMPLES)("$id reads as a real document", (example) => {
    // A stub example would reintroduce the blank-page problem these exist to
    // solve, and an overlong one is unreadable in the preview pane.
    expect(example.text.length).toBeGreaterThanOrEqual(
      KNOWLEDGE_BASE_EXAMPLE_MIN_LENGTH,
    );
    expect(example.text.length).toBeLessThanOrEqual(
      KNOWLEDGE_BASE_EXAMPLE_MAX_LENGTH,
    );
  });

  it.each(KNOWLEDGE_BASE_EXAMPLES)(
    "$id demonstrates the markdown section shape the tab teaches",
    (example) => {
      const headings = example.text.match(/^## .+$/gm) ?? [];
      expect(headings.length).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(KNOWLEDGE_BASE_EXAMPLES)(
    "$id carries no unfilled placeholders",
    (example) => {
      // A surviving "[your stack]" would reach the model literally.
      expect(example.text).not.toMatch(/\[[^\]]+\]/);
    },
  );

  it.each(KNOWLEDGE_BASE_EXAMPLES)("$id uses no em dashes", (example) => {
    // Rendered copy, and the generator is separately instructed to avoid them.
    expect(example.text).not.toMatch(/—/);
    expect(example.title).not.toMatch(/—/);
    expect(example.description).not.toMatch(/—/);
  });

  it("covers solo tenants in the first person, not only agencies", () => {
    // Roughly half of tenants are solo. An edit that made every example a team
    // would quietly tell those users the feature is not for them.
    const solo = KNOWLEDGE_BASE_EXAMPLES.find((e) => e.id === "solo-freelancer");
    const agency = KNOWLEDGE_BASE_EXAMPLES.find((e) => e.id === "dev-agency");
    expect(solo?.text).toMatch(/\bI\b/);
    expect(agency?.text).toMatch(/\bwe\b/i);
  });
});
