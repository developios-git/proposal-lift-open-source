/**
 * Tunables for the knowledge base starter examples and document import.
 *
 * There is deliberately no cap on the knowledge base field itself. The
 * `knowledge_base` column is uncapped, so any limit added now would lock an
 * existing user out of editing a knowledge base they already saved. The import
 * caps below bound what a single upload can *produce*, which is a different
 * thing: the user can still type past them afterwards.
 */

/**
 * Ceiling for a single starter example. Well under any practical prompt budget,
 * and short enough that the dialog's preview pane stays readable.
 */
export const KNOWLEDGE_BASE_EXAMPLE_MAX_LENGTH = 4000;

/**
 * Floor for a single starter example. A stub example would reintroduce the
 * blank-page problem these exist to solve, so the test enforces a real document.
 */
export const KNOWLEDGE_BASE_EXAMPLE_MIN_LENGTH = 800;

/**
 * Largest document accepted by `POST /api/knowledge-base/import`. Route handlers
 * have no framework-level body cap in this app (no `serverActions.bodySizeLimit`
 * is configured), so this is the only ceiling there is.
 */
export const KNOWLEDGE_BASE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Ceiling on the text a single import can hand back.
 *
 * Roughly 5,000 prompt tokens: comfortably above a good knowledge base (the
 * starter examples run 1,400 to 2,200 characters) and well under a runaway that
 * would inflate the cost of every proposal generated afterwards. Anything cut is
 * reported to the user rather than dropped silently.
 */
export const KNOWLEDGE_BASE_EXTRACT_MAX_CHARS = 20_000;

/** Extensions the import route can read. Drives the file picker's `accept` too. */
export const KNOWLEDGE_BASE_ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
] as const;
