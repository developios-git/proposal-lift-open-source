import { QUALIFY_REASON_MAX_LENGTH } from "./constants";
import type { QualifyResult } from "./types";

/** Bounds a runaway list so the popover can't grow unbounded. */
const MAX_UNVERIFIABLE = 10;

/** Strips a markdown code fence the model was told not to emit but sometimes does. */
function stripCodeFence(raw: string): string {
  return raw
    .replace(/^\s*```[a-zA-Z]*\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

/**
 * Parses the model's response into a verdict.
 *
 * Returns null on anything it cannot trust — malformed JSON, an unrecognised
 * verdict, a missing reason. The caller surfaces Retry
 * rather than showing the user a guessed verdict.
 */
export function parseQualifyResponse(raw: string): QualifyResult | null {
  const text = stripCodeFence(raw ?? "");
  if (!text) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  const verdictRaw = obj.verdict;
  if (typeof verdictRaw !== "string") return null;
  const verdict = verdictRaw.trim().toLowerCase();
  if (verdict !== "qualified" && verdict !== "disqualified") return null;

  const reasonRaw = obj.reason;
  if (typeof reasonRaw !== "string") return null;
  const reason = reasonRaw.trim();
  if (!reason) return null;

  return {
    verdict,
    reason:
      reason.length > QUALIFY_REASON_MAX_LENGTH
        ? `${reason.slice(0, QUALIFY_REASON_MAX_LENGTH - 1).trimEnd()}…`
        : reason,
    unverifiable: parseUnverifiable(obj.unverifiable),
  };
}

/**
 * Tolerant on purpose: a malformed `unverifiable` degrades to an empty list
 * rather than failing the whole verdict, since the verdict itself is still
 * usable. Only `verdict` and `reason` are load-bearing enough to reject on.
 */
function parseUnverifiable(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .slice(0, MAX_UNVERIFIABLE);
}
