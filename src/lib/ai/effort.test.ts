import { describe, expect, it } from "vitest";
import { AI_EFFORT_VALUES, DEFAULT_AI_EFFORT, normalizeEffort } from "./effort";

/**
 * `normalizeEffort` is the only validation this value ever gets.
 *
 * The settings PUT path copies whitelisted fields straight from the request
 * body into the update with no type or range check, so a hand-crafted request
 * can put anything in the column. Everything that comes back out goes on to a
 * provider, where a bad value is a 400 mid-generation rather than a save-time
 * error — which is exactly the failure this whole change exists to remove.
 */
describe("normalizeEffort", () => {
  it("passes through every value it offers", () => {
    for (const value of AI_EFFORT_VALUES) {
      expect(normalizeEffort(value)).toBe(value);
    }
  });

  /** A row that predates the effort columns, or was never written. */
  it("falls back to the default for an absent value", () => {
    expect(normalizeEffort(null)).toBe(DEFAULT_AI_EFFORT);
    expect(normalizeEffort(undefined)).toBe(DEFAULT_AI_EFFORT);
    expect(normalizeEffort("")).toBe(DEFAULT_AI_EFFORT);
  });

  /**
   * The migration drops the temperature columns, but a stale client or a
   * replayed request can still send a number. It must not reach a provider as
   * an effort level.
   */
  it("rejects a legacy temperature value", () => {
    expect(normalizeEffort(0.7)).toBe(DEFAULT_AI_EFFORT);
    expect(normalizeEffort("0.7")).toBe(DEFAULT_AI_EFFORT);
    expect(normalizeEffort(0)).toBe(DEFAULT_AI_EFFORT);
  });

  /**
   * Both SDKs accept these; not every model above our floors does. `xhigh`
   * postdates Claude Opus 4.7, so passing it through would reintroduce the
   * per-model 400 this change removes.
   */
  it("rejects effort levels the providers accept but our models may not", () => {
    for (const value of ["xhigh", "max", "minimal", "none"]) {
      expect(normalizeEffort(value)).toBe(DEFAULT_AI_EFFORT);
    }
  });

  it("is forgiving about case and surrounding whitespace", () => {
    expect(normalizeEffort("HIGH")).toBe("high");
    expect(normalizeEffort("  Low  ")).toBe("low");
  });

  it("rejects anything else without throwing", () => {
    for (const value of [{}, [], true, Symbol("high"), () => "high", NaN]) {
      expect(normalizeEffort(value)).toBe(DEFAULT_AI_EFFORT);
    }
  });

  /** A default outside the offered set would be unselectable in the UI. */
  it("has a default that is itself a valid value", () => {
    expect(AI_EFFORT_VALUES).toContain(DEFAULT_AI_EFFORT);
  });
});
