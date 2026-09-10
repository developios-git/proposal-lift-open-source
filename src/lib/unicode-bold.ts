/**
 * Unicode Sans-Serif Bold and toggle to normal.
 * Ctrl+B: normal → bold; bold → normal.
 */

// Sans-Serif Bold ranges (current output)
const BOLD_CAPITAL_START = 0x1d5d4; // 𝗔
const BOLD_CAPITAL_END = 0x1d5ed; // 𝗭
const BOLD_SMALL_START = 0x1d5ee; // 𝗮
const BOLD_SMALL_END = 0x1d607; // 𝗓
const BOLD_DIGIT_START = 0x1d7ec; // 𝟬
const BOLD_DIGIT_END = 0x1d7f5; // 𝟵

// Mathematical Bold ranges (legacy, for toggle-back compatibility)
const MATH_BOLD_CAPITAL_START = 0x1d400;
const MATH_BOLD_CAPITAL_END = 0x1d419;
const MATH_BOLD_SMALL_START = 0x1d41a;
const MATH_BOLD_SMALL_END = 0x1d433;
const MATH_BOLD_DIGIT_START = 0x1d7ce;
const MATH_BOLD_DIGIT_END = 0x1d7d7;

function isBoldChar(code: number): boolean {
  return (
    (code >= BOLD_CAPITAL_START && code <= BOLD_CAPITAL_END) ||
    (code >= BOLD_SMALL_START && code <= BOLD_SMALL_END) ||
    (code >= BOLD_DIGIT_START && code <= BOLD_DIGIT_END) ||
    (code >= MATH_BOLD_CAPITAL_START && code <= MATH_BOLD_CAPITAL_END) ||
    (code >= MATH_BOLD_SMALL_START && code <= MATH_BOLD_SMALL_END) ||
    (code >= MATH_BOLD_DIGIT_START && code <= MATH_BOLD_DIGIT_END)
  );
}

/** Convert text to Unicode Sans-Serif Bold (sans-serif appearance). */
export function toSansSerifBold(text: string): string {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0) ?? char.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d5d4 + (code - 65)); // A-Z
      if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d5ee + (code - 97)); // a-z
      if (code >= 48 && code <= 57) return String.fromCodePoint(0x1d7ec + (code - 48)); // 0-9
      return char;
    })
    .join("");
}

/** Convert Unicode bold (Sans-Serif or Mathematical) back to normal ASCII. */
export function toNormal(text: string): string {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0) ?? char.charCodeAt(0);
      if (code >= BOLD_CAPITAL_START && code <= BOLD_CAPITAL_END)
        return String.fromCodePoint(65 + (code - BOLD_CAPITAL_START)); // 𝗔→A
      if (code >= BOLD_SMALL_START && code <= BOLD_SMALL_END)
        return String.fromCodePoint(97 + (code - BOLD_SMALL_START)); // 𝗮→a
      if (code >= BOLD_DIGIT_START && code <= BOLD_DIGIT_END)
        return String.fromCodePoint(48 + (code - BOLD_DIGIT_START)); // 𝟬→0
      if (code >= MATH_BOLD_CAPITAL_START && code <= MATH_BOLD_CAPITAL_END)
        return String.fromCodePoint(65 + (code - MATH_BOLD_CAPITAL_START)); // 𝐀→A
      if (code >= MATH_BOLD_SMALL_START && code <= MATH_BOLD_SMALL_END)
        return String.fromCodePoint(97 + (code - MATH_BOLD_SMALL_START)); // 𝐚→a
      if (code >= MATH_BOLD_DIGIT_START && code <= MATH_BOLD_DIGIT_END)
        return String.fromCodePoint(48 + (code - MATH_BOLD_DIGIT_START)); // 𝟎→0
      return char;
    })
    .join("");
}

export function hasAnyBoldChar(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? char.charCodeAt(0);
    if (isBoldChar(code)) return true;
  }
  return false;
}

/**
 * Bold a run, or un-bold it if any character in it is already bold.
 *
 * Shared with the Chrome extension, which bundles this module directly rather
 * than keeping its own copy of the code-point tables — that copy was where the
 * two could silently drift.
 */
export function toggleUnicodeBold(text: string): string {
  return hasAnyBoldChar(text) ? toNormal(text) : toSansSerifBold(text);
}

export function handleBoldKeyDown<T extends HTMLTextAreaElement>(
  e: React.KeyboardEvent<T>,
  value: string,
  setValue: (val: string) => void
): void {
  if (e.ctrlKey && e.key === "b") {
    e.preventDefault();
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return;
    const selected = value.slice(start, end);
    const transformed = toggleUnicodeBold(selected);
    const newValue = value.slice(0, start) + transformed + value.slice(end);
    setValue(newValue);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + transformed.length);
    });
  }
}
