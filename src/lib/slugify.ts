/**
 * Normalizes a human-readable label into a URL-safe slug (portfolio categories, etc.).
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
