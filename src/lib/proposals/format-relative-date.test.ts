import { describe, expect, it } from "vitest";
import { formatRelativeDate } from "./format-relative-date";

/**
 * Local time throughout: the function deliberately compares the viewer's
 * midnights, so constructing dates with `new Date(y, m, d, h)` rather than an
 * ISO string is what keeps these assertions timezone-independent.
 */
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m, d, h, min);

describe("formatRelativeDate", () => {
  const now = at(2026, 8, 8, 12, 0); // 8 Sep 2026, midday

  it("calls a timestamp from minutes ago Today", () => {
    // The original bug: `Math.ceil` on elapsed ms made this "Yesterday".
    expect(formatRelativeDate(at(2026, 8, 8, 11, 58).toISOString(), now)).toBe(
      "Today",
    );
  });

  it("calls the same calendar day Today even at its far edges", () => {
    expect(formatRelativeDate(at(2026, 8, 8, 0, 1).toISOString(), now)).toBe(
      "Today",
    );
    expect(formatRelativeDate(at(2026, 8, 8, 23, 59).toISOString(), now)).toBe(
      "Today",
    );
  });

  it("calls the previous calendar day Yesterday, however few hours ago", () => {
    // 23:50 yesterday is ~12 hours old but is still Yesterday to a reader.
    expect(formatRelativeDate(at(2026, 8, 7, 23, 50).toISOString(), now)).toBe(
      "Yesterday",
    );
    expect(formatRelativeDate(at(2026, 8, 7, 0, 5).toISOString(), now)).toBe(
      "Yesterday",
    );
  });

  it("counts whole days up to a week", () => {
    expect(formatRelativeDate(at(2026, 8, 6).toISOString(), now)).toBe(
      "2 days ago",
    );
    expect(formatRelativeDate(at(2026, 8, 2).toISOString(), now)).toBe(
      "6 days ago",
    );
  });

  it("falls back to an absolute date from a week out", () => {
    const old = at(2026, 8, 1);
    expect(formatRelativeDate(old.toISOString(), now)).toBe(
      old.toLocaleDateString(),
    );
  });

  it("treats a future timestamp as Today rather than negative days", () => {
    // Clock skew between the browser and Postgres, not a real future event.
    expect(formatRelativeDate(at(2026, 8, 9).toISOString(), now)).toBe("Today");
  });

  it("renders a dash for missing or unparseable values", () => {
    expect(formatRelativeDate(null, now)).toBe("-");
    expect(formatRelativeDate(undefined, now)).toBe("-");
    expect(formatRelativeDate("", now)).toBe("-");
    expect(formatRelativeDate("not a date", now)).toBe("-");
  });
});
