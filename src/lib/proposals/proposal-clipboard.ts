/**
 * The two copy actions on a generated proposal.
 *
 * These were the same function. "Copy Text" and "Copy Rich Text" sat next to
 * each other, both called `navigator.clipboard.writeText`, and so produced
 * byte-identical plain text — the second button was a label with nothing
 * behind it.
 *
 * They mean different things now, and the difference is the clipboard's
 * `text/html` flavour rather than any change to the words:
 *
 *   - Copy Text      → `text/plain`. What Upwork's proposal box wants, since
 *                      it strips markup anyway.
 *   - Copy Rich Text → `text/html` *and* `text/plain`. Pasting into Gmail,
 *                      Docs or Notion keeps the paragraph breaks; anything
 *                      that cannot read HTML falls back to the same plain
 *                      text the other button would have given.
 *
 * Note this is deliberately not `unicode-bold`. That module fakes bold with
 * Unicode codepoints because Upwork accepts no markup; pasting those glyphs
 * into a real editor produces text that cannot be searched, restyled, or read
 * aloud by a screen reader. Rich text should be actual rich text.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Render proposal text as HTML paragraphs.
 *
 * Blank lines separate paragraphs; single newlines inside one become `<br>`,
 * which is what keeps a bulleted list from collapsing onto a single line.
 */
export function proposalToHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return "";

  return paragraphs
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Copy plain text, resolving false if the clipboard rejected the write. */
export async function copyPlainText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy both HTML and plain-text flavours.
 *
 * `ClipboardItem` is absent in older Safari and in any non-secure context, and
 * Firefox rejects `text/html` writes under some settings. Both are ordinary
 * conditions rather than errors, so fall back to plain text and report success
 * — the user still gets their proposal, just without the markup.
 */
export async function copyRichText(text: string): Promise<boolean> {
  if (!text) return false;

  const html = proposalToHtml(text);

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return true;
    } catch {
      // fall through to plain text
    }
  }

  return copyPlainText(text);
}
