import sanitizeHtml from "sanitize-html";

const STRIP_ALL: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};
const HTML_TAG_REGEX = /<[^>]*>/g;

/**
 * Removes all markup from one persona text field, returning null when nothing
 * survives. Persona text can come from an Upwork profile the user never
 * reviewed, so it is never inserted raw.
 */
export function stripPersonaText(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const cleaned = sanitizeHtml(value, STRIP_ALL)
    .replace(HTML_TAG_REGEX, "")
    .trim();
  return cleaned || null;
}

/** Same treatment for an array field (skills, specializations, certifications). */
export function stripPersonaTags(values: unknown[]): string[] {
  return values
    .map((v) => (typeof v === "string" ? stripPersonaText(v) : null))
    .filter((v): v is string => v !== null);
}
