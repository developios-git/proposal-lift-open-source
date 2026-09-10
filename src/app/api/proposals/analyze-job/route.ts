import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateWithOpenAI } from "@/lib/ai/openai";
import { getOpenAIApiKeyForTenant } from "@/lib/ai/openai-api-key-for-tenant";
import type { ProposalTenant } from "@/lib/extension/membership";
import { MISSING_API_KEY_CODE } from "@/lib/ai/keys";
import { NextResponse, type NextRequest } from "next/server";

const BASE_SCHEMA = `{
  "skills": ["Array of required technical skills extracted from the posting"],
  "experience_level": "entry | intermediate | expert",
  "estimated_budget": {
    "min": 0,
    "max": 0,
    "type": "fixed | hourly"
  },
  "estimated_duration_months": 0,
  "key_requirements": ["Top 3-5 must-have requirements the client emphasized"],
  "red_flags": ["Any concerning signals like unrealistic expectations, scope creep risks, vague requirements"],
  "win_tips": ["3-5 specific tips to make a winning proposal for this particular job"],
  "client_priority": "What the client cares most about: quality | speed | budget | experience",
  "complexity": "low | medium | high",
  "summary": "A 1-2 sentence summary of what the client needs"`;

const RELEVANCE_SCHEMA = `,
  "relevance_score": 0,
  "matching_technologies": ["Tech names from our stack that appear in the job"],
  "relevance_reasoning": "1-2 short sentences explaining the score"
}`;

function buildSystemPrompt(organizationContext: string): string {
  const hasContext = organizationContext.trim().length > 0;
  const schema = BASE_SCHEMA + (hasContext ? RELEVANCE_SCHEMA : "\n}");

  return `You are an Upwork job posting analyzer for a web development agency. Analyze job descriptions and extract structured intelligence.

Respond ONLY with valid JSON matching this exact schema:
${schema}

Be specific and practical. Skills should be actual technologies/tools, not generic terms.${
    hasContext
      ? `

RELEVANCE EVALUATION (required when organization context is provided):
Compare the job title and description against the organization's technology stack and expertise below.
- relevance_score: 0-100 integer. 80-100 = strong match, 60-79 = good match, 40-59 = partial, 20-39 = weak, 0-19 = no match
- matching_technologies: List technologies from our stack that the job explicitly or implicitly requires (empty array if none match)
- relevance_reasoning: 1-2 short sentences only. For high scores: cite matching tech. For low scores: state what's missing

ORGANIZATION KNOWLEDGE BASE / TECH STACK:
${organizationContext}`
      : ""
  }`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobTitle, jobDescription } = await request.json();

    if (!jobDescription) {
      return NextResponse.json(
        { error: "Job description is required" },
        { status: 400 },
      );
    }

    const tenant: ProposalTenant = { userId: user.id };

    // Read through the user's own session, not the service role. Both tables
    // are RLS-scoped to `user_id = auth.uid()`, so the service role reaches
    // nothing extra here and only bypasses the policy that already says the
    // right thing. It also has to be constructed before it can be used, and
    // that constructor throws when SUPABASE_SECRET_KEY is unset, which
    // happened before the missing-key check below could run: that is what
    // turned "add your OpenAI key in Settings" into "Failed to analyze job".
    // Upstream reached for it because it read `organization_settings`, a table
    // this build has no equivalent of.
    const { data: settings } = await supabase
      .from("user_settings")
      .select("knowledge_base")
      .eq("user_id", tenant.userId)
      .maybeSingle();

    let organizationContext = settings?.knowledge_base || "";

    if (!organizationContext.trim()) {
      // Fallback: the technologies across the user's own portfolio. The agency
      // name and description this used to prepend live on
      // `organization_settings`, so they were always undefined here.
      const { data: projects } = await supabase
        .from("projects")
        .select("technologies")
        .eq("user_id", tenant.userId)
        .limit(10);

      const techs = [
        ...new Set((projects ?? []).flatMap((p) => p.technologies || [])),
      ].filter(Boolean);
      if (techs.length) {
        organizationContext = `Technologies: ${techs.join(", ")}`;
      }
    }

    const systemPrompt = buildSystemPrompt(organizationContext);

    const userPrompt = `Analyze this Upwork job posting:

${jobTitle ? `**Title:** ${jobTitle}\n` : ""}**Description:**
${jobDescription}

Extract all relevant information and provide actionable intelligence.${
      organizationContext.trim()
        ? " Also evaluate job relevance against our organization's tech stack and expertise."
        : ""
    }`;

    const apiKey = await getOpenAIApiKeyForTenant(supabase, tenant);
    if (!apiKey) {
      return NextResponse.json(
        {
          // Upstream pointed at a server-side OPENAI_API_KEY as a fallback.
          // That environment variable does not exist in this build, and
          // telling a self-hoster to set it sends them to look for a setting
          // that is deliberately absent.
          error: "Add your OpenAI API key in Settings to analyze a job.",
          code: MISSING_API_KEY_CODE,
        },
        { status: 400 },
      );
    }

    try {
      const result = await generateWithOpenAI(apiKey, {
        systemPrompt,
        userPrompt,
        model: "gpt-5-mini",
        effort: "low",
        maxTokens: 2500,
      });

      console.log("Result from the analynzs job,", result);

      let parsed: Record<string, unknown>;
      try {
        const jsonStr = result.content
          .replace(/```json?\n?/g, "")
          .replace(/```/g, "")
          .trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        return NextResponse.json(
          { error: "AI returned invalid response. Please try again." },
          { status: 500 },
        );
      }

      return NextResponse.json(parsed);
    } catch (aiErr) {
      console.error("Job analysis AI error:", aiErr);
      return NextResponse.json(
        { error: "Failed to analyze job" },
        { status: 500 },
      );
    }
  } catch (err) {
    console.error("Job analysis error:", err);
    return NextResponse.json(
      { error: "Failed to analyze job" },
      { status: 500 },
    );
  }

}
