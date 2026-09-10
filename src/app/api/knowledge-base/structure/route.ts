import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateWithOpenAI } from "@/lib/ai/openai";
import { getOpenAIApiKeyForTenant } from "@/lib/ai/openai-api-key-for-tenant";
import { checkRateLimit } from "@/lib/rate-limit/check";
import { getKnowledgeBaseStructureUserRatelimit } from "@/lib/rate-limit/limiters";
import {
  KNOWLEDGE_BASE_STRUCTURE_SYSTEM_PROMPT,
  buildStructureUserPrompt,
} from "@/lib/knowledge-base/structure-prompt";
import { parseStructuredKnowledgeBase } from "@/lib/knowledge-base/parse-structured-response";
import { KNOWLEDGE_BASE_EXTRACT_MAX_CHARS } from "@/lib/knowledge-base/constants";

/**
 * Reshapes text already extracted by `/api/knowledge-base/import` into the
 * knowledge base section skeleton.
 *
 * Takes text rather than a file. The upload dialog already holds the extracted
 * string, so re-uploading would repeat the transfer and drag the PDF parsers
 * into a route that has no need of them.
 *
 * Upstream this deducted credits before the call and refunded them on both
 * failure paths, and carried an owner/admin check so a `member` could not spend
 * the organization's credits producing text they were not allowed to save.
 * There are no credits and no roles here, so the whole ledger dance is gone —
 * which is why the error handling below is a plain try/catch.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const blocked = await checkRateLimit(
      getKnowledgeBaseStructureUserRatelimit(),
      user.id,
    );
    if (blocked) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment and try again." },
        {
          status: 429,
          headers: { "Retry-After": String(blocked.retryAfterSec) },
        },
      );
    }

    const { text } = await request.json();

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Document text is required" },
        { status: 400 },
      );
    }
    // Matches what the import route can hand out, so this can never be fed more
    // than that route emits.
    if (text.length > KNOWLEDGE_BASE_EXTRACT_MAX_CHARS) {
      return NextResponse.json(
        {
          error: `Document text must be ${KNOWLEDGE_BASE_EXTRACT_MAX_CHARS} characters or fewer`,
        },
        { status: 400 },
      );
    }

    const apiKey = await getOpenAIApiKeyForTenant(supabase, { userId: user.id });
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Add your OpenAI API key in Settings to use this.",
          code: "missing_api_key",
        },
        { status: 400 },
      );
    }

    try {
      const result = await generateWithOpenAI(apiKey, {
        systemPrompt: KNOWLEDGE_BASE_STRUCTURE_SYSTEM_PROMPT,
        userPrompt: buildStructureUserPrompt(text.trim()),
        model: "gpt-5-mini",
        effort: "low",
        maxTokens: 2000,
      });

      const structured = parseStructuredKnowledgeBase(result.content);
      if (!structured) {
        return NextResponse.json(
          { error: "AI returned an empty response. Please try again." },
          { status: 502 },
        );
      }

      return NextResponse.json({
        text: structured.slice(0, KNOWLEDGE_BASE_EXTRACT_MAX_CHARS),
      });
    } catch (aiErr) {
      console.error("[knowledge-base/structure] AI error:", aiErr);
      return NextResponse.json(
        { error: "Failed to structure the document. Please try again." },
        { status: 502 },
      );
    }
  } catch (err) {
    // Name only, never the message: a parser or API exception can quote the
    // document it choked on.
    console.error(
      "[knowledge-base/structure] error:",
      err instanceof Error ? err.name : typeof err,
    );
    return NextResponse.json(
      { error: "Failed to structure the document" },
      { status: 500 },
    );
  }
}
