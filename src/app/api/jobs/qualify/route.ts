import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateWithOpenAI } from "@/lib/ai/openai";
import { getOpenAIApiKeyForTenant } from "@/lib/ai/openai-api-key-for-tenant";
import { checkRateLimit } from "@/lib/rate-limit/check";
import { getQualifyJobUserRatelimit } from "@/lib/rate-limit/limiters";
import {
  buildQualifySystemPrompt,
  buildQualifyUserPrompt,
} from "@/lib/jobs/qualify/build-qualify-prompt";
import { parseQualifyResponse } from "@/lib/jobs/qualify/parse-qualify-response";
import {
  FILTER_DISABLED_CODE,
  FILTER_DISABLED_MESSAGE,
  savedFilterIsEnabled,
} from "@/lib/jobs/saved-filter-feed-eligible";
import type { QualifyJobInput } from "@/lib/jobs/qualify/types";
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
        getQualifyJobUserRatelimit(),
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

      const { filterId, job } = (await request.json()) as {
        filterId?: string;
        job?: QualifyJobInput;
      };

      if (!filterId || typeof filterId !== "string") {
        return NextResponse.json(
          { error: "filterId is required" },
          { status: 400 },
        );
      }
      if (!job || typeof job !== "object" || typeof job.title !== "string") {
        return NextResponse.json(
          { error: "A job with a title is required" },
          { status: 400 },
        );
      }

      // Criteria come from the row, never the request body — the verdict must
      // reflect what is actually saved, and the client must not be able to
      // substitute its own prompt.
      const { data: filterRow, error: filterError } = await supabase
        .from("saved_job_filters")
        .select("qualify_criteria, qualify_enabled, is_enabled")
        .eq("id", filterId)
        .eq("user_id", user.id)
        .maybeSingle<{
          qualify_criteria: string | null;
          qualify_enabled: boolean | null;
          is_enabled: boolean | null;
        }>();

      if (filterError) {
        return NextResponse.json(
          { error: filterError.message },
          { status: 500 },
        );
      }
      if (!filterRow) {
        return NextResponse.json({ error: "Filter not found" }, { status: 404 });
      }
      // Checked before the criteria/qualify gates: "the whole filter is off" is
      // more fundamental than "AI Qualify is off". Grading spends the user's
      // own OpenAI quota, and this route is reachable regardless of the
      // client-side redirect away from a disabled filter.
      if (!savedFilterIsEnabled(filterRow)) {
        return NextResponse.json(
          { error: FILTER_DISABLED_MESSAGE, code: FILTER_DISABLED_CODE },
          { status: 400 },
        );
      }

      const criteria = (filterRow.qualify_criteria ?? "").trim();
      if (!criteria) {
        return NextResponse.json(
          {
            error: "Set your qualify criteria before checking jobs.",
            code: "QUALIFY_CRITERIA_MISSING",
          },
          { status: 400 },
        );
      }
      if (!filterRow.qualify_enabled) {
        return NextResponse.json(
          {
            error: "AI Qualify is disabled for this filter.",
            code: "QUALIFY_DISABLED",
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
          systemPrompt: buildQualifySystemPrompt(criteria),
          userPrompt: buildQualifyUserPrompt(job),
          model: "gpt-5-mini",
          effort: "low",
          maxTokens: 800,
        });

        const parsed = parseQualifyResponse(result.content);
        if (!parsed) {
          return NextResponse.json(
            { error: "AI returned an invalid response. Please try again." },
            { status: 502 },
          );
        }

        return NextResponse.json({
          jobId: job.id,
          verdict: parsed.verdict,
          reason: parsed.reason,
          unverifiable: parsed.unverifiable,
        });
      } catch (aiErr) {
        console.error("[jobs/qualify] AI error:", aiErr);
        return NextResponse.json(
          { error: "Failed to qualify this job. Please try again." },
          { status: 502 },
        );
      }
    } catch (err) {
      console.error("[jobs/qualify] error:", err);
      return NextResponse.json(
        { error: "Failed to qualify this job" },
        { status: 500 },
      );
    }
}
