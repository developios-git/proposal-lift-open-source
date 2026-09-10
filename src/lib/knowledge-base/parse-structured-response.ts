/**
 * Normalises what the model returns from the "Structure with AI" pass.
 *
 * Returns null when there is nothing usable, so the route can report a failure
 * rather than replacing the user's preview with an empty pane. Mirrors
 * `src/lib/jobs/qualify/parse-qualify-response.ts`: the route makes the billing
 * decision, this decides only whether the output is usable.
 */

/** A whole-response code fence, with or without a language tag. */
const WRAPPING_FENCE = /^```[a-z]*\s*\n([\s\S]*?)\n?```$/i;

export function parseStructuredKnowledgeBase(raw: string): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // The prompt forbids fences, but models add them anyway and a leading ``` in
  // the knowledge base would be quoted verbatim into every proposal.
  const unfenced = WRAPPING_FENCE.exec(trimmed)?.[1]?.trim() ?? trimmed;

  return unfenced || null;
}
