/**
 * Cleans up the raw text a PDF or DOCX parser hands back, before it is shown to
 * the user or offered to a model.
 *
 * Deliberately conservative. Every pass here is one that cannot change meaning:
 * whitespace normalisation, page markers, and the hyphen a PDF inserts when it
 * breaks a word across two lines. Nothing is rewritten, reordered, or summarised
 * (that is what the optional AI structuring step is for), so a user who reads the
 * preview is reading their own document.
 *
 * Explicit non-goal: stripping repeated running headers and footers. Detecting
 * them needs an "appears N times" heuristic, and at any N low enough to catch a
 * real footer it also deletes a legitimately repeated heading like `Results`.
 * A wrong deletion is worse than a stray line the user can see and remove.
 */

/**
 * Characters to delete outright: soft hyphen, zero-width space, zero-width
 * non-joiner, zero-width joiner, byte order mark.
 *
 * Listed as code points rather than as literals inside a character class. The
 * literals are invisible, so a regex holding them is unreviewable in a diff and
 * one stray edit silently breaks it.
 */
const INVISIBLE_CODE_POINTS = new Set([0x00ad, 0x200b, 0x200c, 0x200d, 0xfeff]);

/**
 * Characters to fold to an ordinary space: NBSP, ogham space mark, the en/em
 * quad family (U+2000 to U+200A), narrow NBSP, medium mathematical space, and
 * the ideographic space.
 */
const SPACE_CODE_POINTS = new Set([
  0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
  0x2007, 0x2008, 0x2009, 0x200a, 0x202f, 0x205f, 0x3000,
]);

/**
 * A word broken across a line by the typesetter: `develop-\nment`.
 *
 * Both sides must be lowercase. That leaves genuine compounds alone, because in
 * `well-known\nfact` the hyphen is not at the line break, and it leaves
 * `TODO-\nNOTE` alone, because a capital after a break is far more likely to be
 * a new heading than the tail of a split word.
 */
const SPLIT_WORD = /([a-z])-[ \t]*\n[ \t]*([a-z])/g;

/** A line holding nothing but a page number, in either common form. */
const PAGE_MARKER = /^(?:\d{1,4}|page\s+\d{1,4}(?:\s+of\s+\d{1,4})?)$/i;

function foldInvisibleCharacters(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined || INVISIBLE_CODE_POINTS.has(code)) continue;
    out += SPACE_CODE_POINTS.has(code) ? " " : char;
  }
  return out;
}

export function tidyExtractedText(raw: string): string {
  if (!raw) return "";

  const normalized = foldInvisibleCharacters(raw.replace(/\r\n?/g, "\n")).replace(
    SPLIT_WORD,
    "$1$2",
  );

  const lines: string[] = [];
  for (const line of normalized.split("\n")) {
    // Leading whitespace is load-bearing for nested markdown lists, so measure
    // it off and only collapse runs inside the line.
    const indent = /^[ \t]*/.exec(line)?.[0] ?? "";
    const body = line
      .slice(indent.length)
      .replace(/[ \t]{2,}/g, " ")
      .trimEnd();

    if (!body) {
      lines.push("");
      continue;
    }
    // Blanked rather than removed outright, so the pass below can close the gap
    // the removal leaves behind.
    if (PAGE_MARKER.test(body)) {
      lines.push("");
      continue;
    }
    lines.push(indent + body);
  }

  // Any run of blank lines becomes a single paragraph break.
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
