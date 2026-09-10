/**
 * Caps imported document text at a length the knowledge base can carry.
 *
 * Cuts at a line boundary rather than mid-sentence, so what survives still reads
 * as prose. `truncated` is returned rather than inferred by the caller, because
 * the user has to be told plainly that part of their document was dropped.
 */
export function truncateForKnowledgeBase(
  text: string,
  max: number,
): { text: string; truncated: boolean } {
  if (max <= 0) return { text: "", truncated: text.length > 0 };
  if (text.length <= max) return { text, truncated: false };

  const window = text.slice(0, max);
  const lastBreak = window.lastIndexOf("\n");

  // A single line longer than the whole budget has no boundary to cut at, so
  // take the hard cut rather than returning nothing.
  const cut = lastBreak > 0 ? window.slice(0, lastBreak) : window;

  return { text: cut.trimEnd(), truncated: true };
}
