import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateWithOpenAI } from "@/lib/ai/openai";
import { getOpenAIApiKeyForTenant } from "@/lib/ai/openai-api-key-for-tenant";
import { checkRateLimit } from "@/lib/rate-limit/check";
import { getEnhanceCriteriaUserRatelimit } from "@/lib/rate-limit/limiters";
import {
  ENHANCE_CRITERIA_SYSTEM_PROMPT,
  buildEnhanceCriteriaUserPrompt,
  cleanEnhancedCriteria,
} from "@/lib/jobs/qualify/enhance-criteria-prompt";
import { QUALIFY_CRITERIA_MAX_LENGTH } from "@/lib/jobs/qualify/constants";
import { NextResponse, type NextRequest } from "next/server";

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
        getEnhanceCriteriaUserRatelimit(),
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

      const { criteria } = await request.json();

      if (typeof criteria !== "string" || !criteria.trim()) {
        return NextResponse.json(
          { error: "Criteria are required" },
          { status: 400 },
        );
      }
      if (criteria.length > QUALIFY_CRITERIA_MAX_LENGTH) {
        return NextResponse.json(
          {
            error: `Criteria must be ${QUALIFY_CRITERIA_MAX_LENGTH} characters or fewer`,
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
          systemPrompt: ENHANCE_CRITERIA_SYSTEM_PROMPT,
          userPrompt: buildEnhanceCriteriaUserPrompt(criteria.trim()),
          model: "gpt-5-mini",
          effort: "low",
          maxTokens: 2000,
        });

        const enhanced = cleanEnhancedCriteria(result.content);
        if (!enhanced) {
          return NextResponse.json(
            { error: "AI returned an empty response. Please try again." },
            { status: 502 },
          );
        }

        // The prompt targets a lower ceiling, but never hand back something the
        // user cannot save.
        return NextResponse.json({
          enhanced: enhanced.slice(0, QUALIFY_CRITERIA_MAX_LENGTH),
        });
      } catch (aiErr) {
        console.error("[qualify-criteria/enhance] AI error:", aiErr);
        return NextResponse.json(
          { error: "Failed to enhance criteria. Please try again." },
          { status: 502 },
        );
      }
    } catch (err) {
      console.error("[qualify-criteria/enhance] error:", err);
      return NextResponse.json(
        { error: "Failed to enhance criteria" },
        { status: 500 },
      );
    }
}
