/**
 * Prompt for the optional "Structure with AI" pass on an imported document.
 *
 * The one failure that matters here is invention. Whatever this produces becomes
 * the knowledge base, and every generated proposal cites the knowledge base as
 * fact, so a metric the model made up is presented to a real client as a real
 * result. The system prompt leads with that constraint and repeats it, and the
 * user still reviews the output in a preview before it lands in the field.
 *
 * Pure and unit tested. Kept out of the route so the wording is reviewable on its
 * own, the same split as `src/lib/jobs/qualify/build-qualify-prompt.ts`.
 */

/** The section skeleton the starter examples use, so imports and examples read alike. */
export const KNOWLEDGE_BASE_SECTIONS = [
  "## Who we are",
  "## What we do best",
  "## Results",
  "## How we work",
  "## Proof",
] as const;

export const KNOWLEDGE_BASE_STRUCTURE_SYSTEM_PROMPT = `You reorganize a freelancer's or agency's own marketing document into a knowledge base that an AI will later use to write Upwork proposals.

Your only job is to restructure. You are not writing new marketing copy.

Rules, in order of importance:

1. Use only facts that appear in the source text. Never invent or estimate a metric, percentage, client name, project name, tool, certification, team size, year, or price. If the source has no numbers, the output has no numbers.
2. Never soften rule 1 to fill out a section. If the source does not support a section, leave that section out entirely. A short, true knowledge base is worth far more than a complete-looking one that contains anything fabricated.
3. Keep the source's own voice and person. If the document says "we", write "we". If it says "I", write "I". Do not switch between them.
4. Drop slide furniture and boilerplate: page numbers, deck titles, table of contents entries, repeated headers and footers, copyright lines, addresses, phone numbers, email addresses, social handles, and calls to action such as "Contact us today".
5. Merge duplicated statements. Marketing decks repeat the same claim on several slides; say it once.
6. Organize what remains under these headings, in this order, omitting any the source cannot support:

${KNOWLEDGE_BASE_SECTIONS.join("\n")}

7. Under "## Results", prefer concrete outcomes that already carry a number or a named client in the source. Write them as bullets starting with "- ".
8. Keep it under 6000 characters. Cut the weakest material first.

Output format: markdown only. Start with the first "## " heading. No preamble, no closing commentary, no code fences, no explanation of what you changed.`;

export function buildStructureUserPrompt(sourceText: string): string {
  return `Restructure the following document into a knowledge base. Use only what is written here.

--- BEGIN DOCUMENT ---
${sourceText}
--- END DOCUMENT ---`;
}
