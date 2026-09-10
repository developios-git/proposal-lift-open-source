import OpenAI from "openai";
import { resolveOpenAIApiKey } from "./keys";

/**
 * Thrown when embedding is attempted without a saved OpenAI key.
 *
 * A distinct type rather than a bare Error because callers must tell this apart
 * from a genuine API failure: it is the expected state for a user who has not
 * finished onboarding, and it needs a "go add your key" message rather than a
 * retry. `projects.embedding` is left NULL and the project is excluded from
 * matching until it is backfilled.
 */
export class MissingOpenAIKeyError extends Error {
  constructor() {
    super("Add your OpenAI API key in Settings to embed portfolio projects.");
    this.name = "MissingOpenAIKeyError";
  }
}

/**
 * Generates a 1536-dimensional embedding vector for the given text using
 * OpenAI's text-embedding-3-small model.
 *
 * The returned number[] can be serialised for pgvector storage as:
 *   `[${vector.join(",")}]`
 *
 * Per PGVECTOR_PORTFOLIO_MATCHING.md §4:
 *   - The model is text-embedding-3-small ($0.02 / 1M tokens)
 *   - Input is trimmed to 8 000 characters as a safety cap
 *   - Uses the caller's own `user_settings.openai_api_key`. There is no
 *     platform key to fall back to, so a missing key throws rather than
 *     silently producing nothing.
 */
export async function embedText(
  text: string,
  apiKey?: string | null,
): Promise<number[]> {
  const key = resolveOpenAIApiKey(apiKey);
  if (!key) {
    throw new MissingOpenAIKeyError();
  }

  const openai = new OpenAI({ apiKey: key });
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000),
  });

  return response.data[0].embedding;
}

/**
 * Builds the text used to represent a portfolio project for embedding.
 *
 * Per PGVECTOR_PORTFOLIO_MATCHING.md §5, the following fields are combined:
 *   Project Name: {name}
 *   Category:     {category}
 *   Technologies: {comma-separated list}
 *   Description:  {description}
 */
export function buildProjectEmbeddingText(project: {
  name: string;
  category: string;
  technologies: string[] | null;
  description: string | null;
}): string {
  const parts = [
    `Project Name: ${project.name}`,
    `Category: ${project.category}`,
    `Technologies: ${(project.technologies ?? []).join(", ")}`,
  ];
  if (project.description) {
    parts.push(`Description: ${project.description}`);
  }
  return parts.join("\n");
}

/**
 * Text embedded for pgvector portfolio matching (job ↔ project similarity).
 * Mirrors the job section of the proposal user prompt: title, description, optional skills.
 */
export function buildJobPortfolioMatchText(opts: {
  jobTitle: string;
  jobDescription: string;
  skills?: string[] | null;
}): string {
  const chunks = [`${opts.jobTitle}\n\n${opts.jobDescription}`];
  const skills = (opts.skills ?? [])
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
  if (skills.length > 0) {
    chunks.push(`Required skills: ${skills.join(", ")}`);
  }
  return chunks.join("\n\n");
}
