import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { generateWithOpenAI } from "@/lib/ai/openai";
import { getOpenAIApiKeyForTenant } from "@/lib/ai/openai-api-key-for-tenant";
import { NextResponse, type NextRequest } from "next/server";
import {
  PublicUrlFetchError,
  safeFetchPublicHttps,
} from "@/lib/security/safe-public-url-fetch";
import { checkRateLimit } from "@/lib/rate-limit/check";
import { getAnalyzeUrlUserRatelimit } from "@/lib/rate-limit/limiters";

const SYSTEM_PROMPT = `You are a web project analyzer. Given HTML content from a website, extract structured information about the project. Respond ONLY with valid JSON matching this exact schema:

{
  "name": "Project name (infer from title, branding, or domain)",
  "description": "A detailed 2-4 sentence description of what this project/website does, its purpose, target audience, and key features",
  "technologies": ["Array of technologies detected - check meta tags, scripts, CSS frameworks, etc."],
  "category": "One of: wordpress, shopify, headless, webapp, webflow, saas, automation, other",
  "client_name": "Company or brand name if identifiable, otherwise null"
}

Technology detection hints:
- Look for wp-content, wp-includes → WordPress
- Look for Shopify CDN, shopify.com → Shopify
- Look for React, Next.js, Vue, Angular meta tags or script bundles
- Look for Tailwind classes, Bootstrap, Material UI
- Check for common CMS signatures (Webflow, Contentful, Strapi, Sanity)
- Identify languages from script tags (TypeScript, PHP, Python)
- Check for hosting clues (Vercel, Netlify, AWS, Firebase)

Be specific with technology versions when detectable. For description, focus on what makes this project notable from a portfolio perspective.`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const urlRatelimit = await checkRateLimit(
      getAnalyzeUrlUserRatelimit(),
      `user:${user.id}`,
    );
    if (urlRatelimit) {
      return NextResponse.json(
        {
          error: "Too many requests. Try again later.",
          code: "RATE_LIMITED",
          retryAfter: urlRatelimit.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(urlRatelimit.retryAfterSec),
            "X-RateLimit-Limit": String(urlRatelimit.limit),
            "X-RateLimit-Remaining": String(urlRatelimit.remaining),
          },
        },
      );
    }

    const body = await request.json();
    const url = body?.url;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 },
      );
    }

    // Fetch the website content
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let html: string;
    try {
      const { response, bodyText } = await safeFetchPublicHttps(
        parsedUrl.toString(),
        {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; PortfolioAnalyzer/1.0)",
            Accept: "text/html,application/xhtml+xml",
          },
          maxRedirects: 5,
          maxResponseBytes: 2_000_000,
        },
      );
      clearTimeout(timeout);

      if (!response.ok) {
        return NextResponse.json(
          {
            error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
          },
          { status: 400 },
        );
      }

      html = bodyText;
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof PublicUrlFetchError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Request timed out (15s). The website may be too slow or blocking requests."
          : "Failed to fetch the URL. Please check the URL and try again.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // Trim HTML to avoid token limits - keep head + first chunk of body
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const headContent = headMatch?.[1] || "";
    const bodyContent = bodyMatch?.[1] || html;

    // Strip script/style content to focus on meaningful HTML
    const cleanBody = bodyContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const truncatedBody = cleanBody.slice(0, 8000);
    const truncatedHead = headContent.slice(0, 4000);

    const userPrompt = `Analyze this website at ${parsedUrl.hostname}:

<head>
${truncatedHead}
</head>

<body excerpt>
${truncatedBody}
</body>

Respond with JSON only.`;

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


    let result: Awaited<ReturnType<typeof generateWithOpenAI>>;
    try {
      result = await generateWithOpenAI(apiKey, {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        model: "gpt-5-mini",
        effort: "low",
        maxTokens: 1000,
      });
    } catch (aiErr) {
      console.error("URL analysis AI error:", aiErr);
      return NextResponse.json(
        { error: "Failed to analyze URL" },
        { status: 500 },
      );
    }

    // Parse the JSON response
    let parsed: Record<string, unknown>;
    try {
      const jsonStr = result.content
        .replace(/```json?\n?/g, "")
        .replace(/```/g, "")
        .trim();
      parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "AI returned invalid response. Please try again." },
        { status: 500 },
      );
    }

    const defaultCategories: string[] = [
      "wordpress",
      "shopify",
      "headless",
      "webapp",
      "webflow",
      "saas",
      "automation",
      "other",
    ];
    let validCategories = defaultCategories;

    const { data: userCats } = await createSupabaseServiceClient()
      .from("portfolio_categories")
      .select("slug")
      .eq("user_id", user.id);
    if (userCats?.length) {
      validCategories = userCats.map((c) => c.slug);
    }

    const p = parsed as {
      name?: string;
      description?: string;
      technologies?: unknown;
      category?: string;
      client_name?: string | null;
    };
    const aiCategory = (p.category || "").toLowerCase();
    const matchedCategory = validCategories.includes(aiCategory)
      ? aiCategory
      : validCategories.find(
          (s) => s.includes(aiCategory) || aiCategory.includes(s),
        ) || validCategories[0];

    const analysis = {
      name: p.name || parsedUrl.hostname,
      description: p.description || "",
      technologies: Array.isArray(p.technologies) ? p.technologies : [],
      category: matchedCategory,
      client_name: p.client_name ?? null,
    };

    return NextResponse.json(analysis);
  } catch (err) {
    console.error("URL analysis error:", err);
    return NextResponse.json(
      { error: "Failed to analyze URL" },
      { status: 500 },
    );
  }

}
