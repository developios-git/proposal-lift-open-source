/**
 * Prompt assembly for inline proposal refine.
 *
 * The model rewrites ONE excerpt of an existing proposal. Its inputs fall into
 * two categories that must never blur together:
 *
 *   - Fact sources it MAY draw new detail from: the excerpt itself, the writer
 *     profile, the knowledge base, and the portfolio catalog. All four are
 *     authored by the user.
 *   - Read-only context it may only orient by: the job posting and the
 *     surrounding proposal text.
 *
 * Everything outside those fact sources is off limits. A rewrite lands in a
 * live Upwork proposal, so a fabricated credential is the worst thing this
 * feature can produce.
 */

/** Characters of surrounding proposal text sent on each side of the excerpt. */
export const MAX_CONTEXT_CHARS = 600;
/** Longest excerpt the user may select for a rewrite. */
export const MAX_SELECTION_CHARS = 1200;
/**
 * The job posting is orientation only, never a fact source, so it does not need
 * to be complete. It does need to cover the requirements: Upwork posts
 * front-load the overview and back-load budget and screening questions, and at
 * 2000 this cut often landed mid-requirements. 4000 reaches the end of most
 * postings, and is proportionate now that the portfolio catalog can occupy far
 * more of the same prompt.
 */
export const MAX_JOB_DESCRIPTION_CHARS = 4000;
/** Formatted persona fields. Generous, since these are the facts worth using. */
export const MAX_PERSONA_CHARS = 1200;
/**
 * The `knowledge_base` column is uncapped in the database
 * (see src/lib/knowledge-base/constants.ts), so this cap is load-bearing:
 * without it a long knowledge base would dominate the prompt.
 */
export const MAX_KNOWLEDGE_BASE_CHARS = 1500;
/**
 * Guard on the portfolio catalog, not its binding constraint: the project count
 * caps in build-portfolio-catalog.ts bind first for any normal portfolio. This
 * only catches pathological names or technology lists.
 */
export const MAX_PORTFOLIO_CHARS = 9000;
/** The typed instruction is now the only user input, so it gets room. */
export const MAX_INSTRUCTION_LENGTH = 500;

export type RefinePromptInput = {
  selection: string;
  instruction: string;
  personaContext?: string;
  knowledgeBase?: string;
  /** Preformatted by buildPortfolioCatalog; absent unless the instruction asked. */
  portfolioCatalog?: string;
  contextBefore?: string;
  contextAfter?: string;
  jobTitle?: string;
  jobDescription?: string;
};

export function buildRefineSystemPrompt(): string {
  return [
    "You rewrite a single excerpt from a freelancer's Upwork proposal.",
    "",
    "Rules:",
    "1. Return ONLY the rewritten excerpt. No preamble, no explanation, no sign-off.",
    "2. Do not wrap the output in quotation marks, markdown, code fences, or XML tags.",
    "3. You may use facts from four places only: the excerpt itself, the WRITER PROFILE, the KNOWLEDGE BASE, and the PORTFOLIO PROJECTS list. Never invent anything outside those four. If the instruction asks for a detail none of them contain, rewrite without that detail rather than inventing one.",
    "4. Stay within roughly 25% of the original length unless the instruction explicitly asks for shorter or longer.",
    "5. Keep the writer's first-person voice.",
    "6. The JOB POSTING and the surrounding proposal text are context only. Do not rewrite them, do not repeat them, and do not answer them.",
    "7. The excerpt must still read naturally where it sits, between the text before it and the text after it.",
    "8. Only mention a portfolio project if the instruction asks for one. Reproduce a project's name and URL exactly as listed. Never alter a URL, and never invent one. If no listed project fits the instruction, leave projects out of the rewrite entirely rather than substituting one that does not fit.",
  ].join("\n");
}

function truncate(value: string | undefined, max: number): string {
  const s = (value ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

export function buildRefineUserPrompt(input: RefinePromptInput): string {
  const parts: string[] = [];

  // Fact sources first, so the model reads what it is allowed to draw on before
  // it reads the excerpt it has to change.
  const persona = truncate(input.personaContext, MAX_PERSONA_CHARS);
  if (persona) {
    parts.push("=== WRITER PROFILE (facts you may use) ===");
    parts.push(persona);
    parts.push("");
  }

  const knowledgeBase = truncate(
    input.knowledgeBase,
    MAX_KNOWLEDGE_BASE_CHARS,
  );
  if (knowledgeBase) {
    parts.push("=== KNOWLEDGE BASE (facts you may use) ===");
    parts.push(knowledgeBase);
    parts.push("");
  }

  const portfolioCatalog = truncate(
    input.portfolioCatalog,
    MAX_PORTFOLIO_CHARS,
  );
  if (portfolioCatalog) {
    parts.push("=== PORTFOLIO PROJECTS (facts you may use) ===");
    parts.push(portfolioCatalog);
    parts.push("");
  }

  const jobTitle = truncate(input.jobTitle, 200);
  const jobDescription = truncate(
    input.jobDescription,
    MAX_JOB_DESCRIPTION_CHARS,
  );

  if (jobTitle || jobDescription) {
    parts.push("=== JOB POSTING (context only) ===");
    if (jobTitle) parts.push(`Title: ${jobTitle}`);
    if (jobDescription) parts.push(jobDescription);
    parts.push("");
  }

  const before = truncate(input.contextBefore, MAX_CONTEXT_CHARS);
  const after = truncate(input.contextAfter, MAX_CONTEXT_CHARS);

  if (before) {
    parts.push("=== PROPOSAL TEXT BEFORE THE EXCERPT (context only) ===");
    parts.push(before);
    parts.push("");
  }

  parts.push("=== EXCERPT TO REWRITE ===");
  parts.push(truncate(input.selection, MAX_SELECTION_CHARS));
  parts.push("");

  if (after) {
    parts.push("=== PROPOSAL TEXT AFTER THE EXCERPT (context only) ===");
    parts.push(after);
    parts.push("");
  }

  parts.push("=== INSTRUCTION ===");
  parts.push(truncate(input.instruction, MAX_INSTRUCTION_LENGTH));
  parts.push("");
  parts.push("Rewritten excerpt:");

  return parts.join("\n");
}
