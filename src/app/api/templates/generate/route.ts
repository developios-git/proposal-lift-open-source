import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateWithOpenAI } from "@/lib/ai/openai";
import { getOpenAIApiKeyForTenant } from "@/lib/ai/openai-api-key-for-tenant";
import { describeAIFailure } from "@/lib/ai/ai-failure";
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit/check";
import { getTemplateGenerateUserRatelimit } from "@/lib/rate-limit/limiters";

const SYSTEM_PROMPT = `You are a proposal template expert for a web development agency on Upwork. Generate professional proposal templates with dynamic variables.

Rules:
- Use {{variable_name}} syntax for dynamic variables (snake_case)
- Always include: {{client_name}}, {{project_description}} as minimum variables
- Structure the template with clear sections using ## headers
- Make templates persuasive, professional, and tailored to the category
- Include 5-8 dynamic variables that make the template reusable
- Write 100-140 words

Respond ONLY with valid JSON matching this schema:
{
  "name": "Template name",
  "content": "The full template content with {{variables}}",
  "variables": ["client_name", "project_description", "etc"],
  "description": "One sentence describing this template"
}`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tmplBlock = await checkRateLimit(
      getTemplateGenerateUserRatelimit(),
      `user:${user.id}`,
    );
    if (tmplBlock) {
      return NextResponse.json(
        {
          error: "Too many requests. Try again later.",
          code: "RATE_LIMITED",
          retryAfter: tmplBlock.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(tmplBlock.retryAfterSec),
            "X-RateLimit-Limit": String(tmplBlock.limit),
            "X-RateLimit-Remaining": String(tmplBlock.remaining),
          },
        },
      );
    }

    const { category, purpose } = await request.json();

    if (!category) {
      return NextResponse.json(
        { error: "Category is required" },
        { status: 400 },
      );
    }

    const userPrompt = `Generate a proposal template for the "${category}" category.${purpose ? `\n\nSpecific purpose: ${purpose}` : ""}

The template should be professional, persuasive, and optimized for winning Upwork contracts in this category. Include relevant technical details and value propositions.`;

    const apiKey = await getOpenAIApiKeyForTenant(supabase, { userId: user.id });
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Add your OpenAI API key in Settings to generate templates.",
          code: "missing_api_key",
        },
        { status: 400 },
      );
    }

    try {
      const result = await generateWithOpenAI(apiKey, {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        model: "gpt-5-mini",
        effort: "medium",
        maxTokens: 1500,
      });

      let parsed: {
        name?: string;
        content?: string;
        variables?: unknown;
        description?: string;
      };
      try {
        const jsonStr = result.content
          .replace(/```json?\n?/g, "")
          .replace(/```/g, "")
          .trim();
        parsed = JSON.parse(jsonStr) as typeof parsed;
      } catch {
        return NextResponse.json(
          { error: "AI returned invalid response. Please try again." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        name: parsed.name || `${category} Template`,
        content: parsed.content || "",
        variables: Array.isArray(parsed.variables) ? parsed.variables : [],
        description: parsed.description || "",
      });
    } catch (genErr) {
      console.error("Template generation error:", genErr);
      // Says whose problem it is: a rejected key, an exhausted account, or
      // OpenAI being down are all things the user can act on, and all three
      // previously read as "Failed to generate template".
      const failure = describeAIFailure(
        genErr,
        "openai",
        "Failed to generate template",
      );
      return NextResponse.json(
        { error: failure.message, code: failure.code },
        { status: failure.status },
      );
    }
  } catch (err) {
    console.error("Template generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate template" },
      { status: 500 },
    );
  }

}
