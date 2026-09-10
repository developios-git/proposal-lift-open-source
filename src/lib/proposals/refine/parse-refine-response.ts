/**
 * Cleans model output for inline proposal refine.
 *
 * Even with an explicit "return only the excerpt" instruction, models leak a
 * preamble, wrap the answer in quotes, or echo the structure tags used by the
 * full proposal prompt. This strips all three before the text reaches the user.
 */

/** Matches "Here is the revised version:", "Rewritten excerpt:", etc. on its own line. */
const PREAMBLE_PATTERN =
  /^\s*(?:sure[,!.]?\s*)?(?:here(?:'s| is| are)?|this is)?\s*(?:the\s+)?(?:revised|rewritten|updated|new|refined|improved)?\s*(?:excerpt|version|text|passage|paragraph|copy)?\s*:\s*\n/i;

const CODE_FENCE_PATTERN = /^```[a-z]*\n([\s\S]*?)\n?```$/i;

function stripStructureTags(text: string): string {
  return text.replace(/<\/?(?:hook|body|excerpt)>/gi, "");
}

function stripWrappingQuotes(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < 2) return trimmed;

  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"],
  ];

  for (const [open, close] of pairs) {
    if (!trimmed.startsWith(open) || !trimmed.endsWith(close)) continue;
    const inner = trimmed.slice(1, -1);
    // Only unwrap when the quotes actually enclose the whole passage, so a
    // legitimate quotation inside the text is not mangled.
    if (!inner.includes(close)) return inner.trim();
  }

  return trimmed;
}

/**
 * Returns the cleaned excerpt, or an empty string when nothing usable remains.
 * Em dashes become commas, matching the rest of our user-facing copy.
 */
export function parseRefineResponse(raw: string): string {
  let text = String(raw ?? "").trim();
  if (!text) return "";

  const fenced = text.match(CODE_FENCE_PATTERN);
  if (fenced) text = fenced[1].trim();

  text = stripStructureTags(text).trim();
  text = text.replace(PREAMBLE_PATTERN, "").trim();
  text = stripWrappingQuotes(text);
  // Same no-em-dash rule as sanitizeHookContent, but absorbing the surrounding
  // spaces so "a — b" lands as "a, b" rather than "a , b".
  text = text.replace(/\s*[—–]\s*/g, ", ");

  return text.trim();
}
