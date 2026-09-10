/**
 * Turns free-form text (e.g. a ChatGPT reply) into { projects: [...] } for import validation.
 */
import OpenAI from "openai";
import { extractJsonObjectSpan } from "@/lib/portfolio/import-schema";

const MODEL =
  process.env.PORTFOLIO_IMPORT_NORMALIZE_MODEL?.trim() || "gpt-4o-mini";

const SYSTEM_PROMPT = `You extract portfolio projects from pasted text (markdown, bullets, or prose).

Respond with ONE JSON object only (no markdown code fences, no commentary). Exact shape:

{
  "projects": [
    {
      "name": "string — required project title",
      "url": "string | null — full https:// or http:// URL only if it appears in or can be directly inferred from the pasted text; otherwise null",
      "description": "string | null — short summary or null",
      "technologies": ["string", "..."],
      "category": "string — short label for how the user groups this work (e.g. Amazon PPC, Catalog & listings, Fulfillment & inventory, SaaS, Web App). Use the exact phrase from the paste when the user gave one. If they only gave a project type, infer a concise label (a few words, under ~60 characters). Do not use empty string; if nothing fits, use \"General\".",
      "image": "string | null — image URL if given",
      "featured": true or false
    }
  ]
}

Strict rules:
- Include multiple objects if the paste clearly describes multiple distinct projects.
- Every included project MUST have a non-empty "name". Never fabricate URLs.
- If the paste gives a usable http(s) link for a project, set "url" to that exact URL (same domain/path as stated). If there is no link, set "url" to null and still include the project.
Category rules:
- Preserve the user's own category names from the text when present (spelling, "&", slashes, etc.).
- Only invent a category when the paste does not name one; keep it specific to the work (not a long sentence).
- "technologies": use [] if unknown.
- "featured": default false unless the text explicitly marks spotlight / featured work.`;


export async function normalizeChatgptPortfolioImportText(
  pastedText: string,
  apiKey: string,
): Promise<
  { ok: true; projects: unknown[] } | { ok: false; error: string }
> {
  const trimmed = pastedText.trim();
  if (!trimmed) {
    return { ok: false, error: "Paste is empty" };
  }

  const openai = new OpenAI({ apiKey });

  let content: string;
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Convert the following text into JSON with a "projects" array only.\n\n---\n${trimmed.slice(0, 120_000)}\n---`,
        },
      ],
    });
    content = completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    console.error("[normalizeChatgptPortfolioImportText]", e);
    return { ok: false, error: msg };
  }

  if (!content) {
    return { ok: false, error: "Empty response from model" };
  }

  let parsed: unknown;
  try {
    const span = extractJsonObjectSpan(content);
    parsed = JSON.parse(span);
  } catch {
    return {
      ok: false,
      error:
        "Could not parse structured data from the model. Try shortening the paste or try again.",
    };
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("projects" in parsed) ||
    !Array.isArray((parsed as { projects: unknown }).projects)
  ) {
    return {
      ok: false,
      error: 'The model did not return a valid "projects" array. Try again.',
    };
  }

  const projects = (parsed as { projects: unknown[] }).projects;
  return { ok: true, projects };
}
