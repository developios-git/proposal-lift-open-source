import { mergeCors } from "@/lib/extension/cors";
import type { ProposalTenant } from "@/lib/extension/membership";
import { createSupabaseForApiRequest } from "@/lib/supabase/api-auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { generateProposal, streamProposal } from "@/lib/ai/generate";
import {
  parseProposalContent,
  parseScreeningContent,
} from "@/lib/proposals/parse-proposal-output";
import {
  MISSING_API_KEY_CODE,
  MissingApiKeyError,
} from "@/lib/ai/keys";
import { NextResponse, type NextRequest } from "next/server";
import type { GenerateProposalRequest, UserSettings } from "@/types";
import {
  buildIdentityContextFromPersona,
  type PersonaIdentityFields,
} from "@/lib/persona-identity";
import { filterPersonasEligibleForProposals } from "@/lib/personas/persona-proposal-eligibility";
import { checkRateLimit } from "@/lib/rate-limit/check";
import { getProposalGenerateUserRatelimit } from "@/lib/rate-limit/limiters";

/**
 * A template is usable when the caller owns it.
 *
 * Upstream also admitted global/platform templates (both ids null) and, for an
 * org tenant, its members' personal templates. Neither exists here.
 */
function templateAllowedForTenant(
  tenant: ProposalTenant,
  row: { user_id: string | null },
): boolean {
  return row.user_id === tenant.userId;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: mergeCors(request, {}),
  });

}

export async function POST(request: NextRequest) {
  try {
    const auth = await createSupabaseForApiRequest(request);
    if (auth.supabase === null) {
      return NextResponse.json(
        { error: auth.error },
        {
          status: auth.status,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    const { supabase, user } = auth;

    const genBlock = await checkRateLimit(
      getProposalGenerateUserRatelimit(),
      `user:${user.id}`,
    );
    if (genBlock) {
      return NextResponse.json(
        {
          error: "Too many requests. Try again later.",
          code: "RATE_LIMITED",
          retryAfter: genBlock.retryAfterSec,
        },
        {
          status: 429,
          headers: mergeCors(request, {
            "Content-Type": "application/json",
            "Retry-After": String(genBlock.retryAfterSec),
            "X-RateLimit-Limit": String(genBlock.limit),
            "X-RateLimit-Remaining": String(genBlock.remaining),
          }),
        },
      );
    }

    const body: GenerateProposalRequest = await request.json();

    const tenant: ProposalTenant = { userId: user.id };


    let { data: userRow } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", tenant.userId)
        .maybeSingle();

      if (!userRow) {
        const service = createSupabaseServiceClient();
        await service
          .from("user_settings")
          .upsert({ user_id: tenant.userId }, { onConflict: "user_id" });
        const { data: again } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", tenant.userId)
          .single();
        userRow = again;
      }

      if (!userRow) {
        return NextResponse.json(
          {
            error:
              "Could not load user settings. Please try again or configure Settings.",
          },
          {
            status: 400,
            headers: mergeCors(request, { "Content-Type": "application/json" }),
          },
        );
      }

    const settings = userRow as UserSettings;

    console.log("Body in the generate proposal route", body);

    let jobTitle = (body.jobTitle || "").trim();
    let jobDescription = (body.jobDescription || "").trim();
    if (body.jobDetails?.trim()) {
      if (!jobDescription) jobDescription = body.jobDetails.trim();
      if (!jobTitle) jobTitle = "Upwork job";
    }

    if (!jobTitle || !jobDescription) {
      return NextResponse.json(
        { error: "Job title and description are required" },
        {
          status: 400,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    const personaSelectForCompletion =
      "id, full_name, role_title, location, timezone, bio, skills, years_of_experience, certifications, specializations, upwork_url, linkedin_url, website_url, github_url";
    const { data: allPersonaRows, error: personasLoadErr } = await supabase
      .from("personas")
      .select(personaSelectForCompletion)
      .eq("user_id", tenant.userId);

    if (personasLoadErr) {
      return NextResponse.json(
        { error: personasLoadErr.message },
        {
          status: 500,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    const allPersonas = allPersonaRows ?? [];
    const eligiblePersonas = filterPersonasEligibleForProposals(allPersonas);
    const eligiblePersonaIds = new Set(eligiblePersonas.map((p) => p.id));

    if (eligiblePersonas.length === 0) {
      const msg =
        allPersonas.length === 0
          ? "Create a proposal persona first on the Personas page, then try again."
          : "No persona reaches 70% completion yet. Finish a persona on the Personas page, then try again.";
      return NextResponse.json(
        { error: msg },
        {
          status: 400,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    const requestedPersonaId = (body.personaId || "").trim();
    if (!requestedPersonaId) {
      return NextResponse.json(
        {
          error:
            "Select a proposal persona before generating. Open the persona dropdown and choose one.",
        },
        {
          status: 400,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    if (!eligiblePersonaIds.has(requestedPersonaId)) {
      return NextResponse.json(
        {
          error:
            "That persona cannot be used yet. Pick a persona with 70%+ completion, or finish this one on the Personas page.",
        },
        {
          status: 400,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    const mergedNotes = body.notes ?? body.customInstructions;

    // Fetch the template if one was chosen. Every template is owned by exactly
    // one user, so ownership is the whole access rule.
    //
    // This used to select `organization_id` as well — a leftover from the
    // org-scoped upstream. The column does not exist in this schema, so
    // Postgres rejected the entire select and every generation that named a
    // template failed with a 500. The authorization check below had already
    // stopped reading it.
    let templateContent: string | undefined;
    if (body.templateId) {
      const { data: templateRaw, error: templateErr } = await supabase
        .from("templates")
        .select("content, user_id")
        .eq("id", body.templateId)
        .maybeSingle();

      if (templateErr) {
        return NextResponse.json(
          { error: templateErr.message },
          {
            status: 500,
            headers: mergeCors(request, { "Content-Type": "application/json" }),
          },
        );
      }

      const template = templateRaw as {
        content: string;
        user_id: string | null;
      } | null;

      if (
        !template ||
        !templateAllowedForTenant(
          tenant,
          { user_id: template.user_id },
        )
      ) {
        return NextResponse.json(
          {
            error: "Template not found or not available for your account.",
          },
          {
            status: 404,
            headers: mergeCors(request, { "Content-Type": "application/json" }),
          },
        );
      }
      templateContent = template.content;
    }

    // Fetch portfolio projects (org or solo).
    // Per PGVECTOR_PORTFOLIO_MATCHING.md:
    //   - If the caller supplied explicit IDs (dashboard manual selection) → use those.
    //   - Otherwise → pgvector similarity on title + description + optional skills
    //     (org via match_portfolio_projects, solo via match_portfolio_projects_solo).
    let portfolioProjects: {
      name: string;
      url: string | null;
      technologies: string[];
      description: string | null;
    }[] = [];

    if (body.selectedProjectIds && body.selectedProjectIds.length > 0) {
      // Manual selection wins — preserve existing dashboard behaviour exactly.
      const { data: projects } = await supabase
        .from("projects")
        .select("name, url, technologies, description")
        .in("id", body.selectedProjectIds)
        .eq("user_id", tenant.userId);

      if (projects) {
        portfolioProjects = projects.map((pr) => ({
          ...pr,
          technologies: pr.technologies ?? [],
        }));
      }
    } else {
      // Auto-select via pgvector semantic similarity (extension + dashboard fallback).
      // Non-fatal: if pgvector isn't set up yet the proposal still generates,
      // just without portfolio context.
      try {
        const { embedText, buildJobPortfolioMatchText } =
          await import("@/lib/ai/embeddings");
        const openaiKey = (settings as Record<string, unknown>).openai_api_key as
          | string
          | undefined;
        const queryText = buildJobPortfolioMatchText({
          jobTitle,
          jobDescription,
          skills: body.skills,
        });
        const jobVector = await embedText(queryText, openaiKey);
        const vectorLiteral = `[${jobVector.join(",")}]`;


        // The two upstream RPCs (org and solo) collapsed into one in this
        // schema: `match_portfolio_projects(query_embedding, p_user_id,
        // match_count)`. Named arguments, so the parameter name matters.
        const { data: matchedRaw } = await supabase.rpc(
          "match_portfolio_projects",
          {
            query_embedding: vectorLiteral,
            p_user_id: tenant.userId,
            match_count: 3,
          },
        );

        if (matchedRaw && Array.isArray(matchedRaw)) {
          portfolioProjects = (
            matchedRaw as Array<{
              name: string;
              url: string | null;
              technologies: string[];
              description: string | null;
              similarity: number;
            }>
          ).map(({ name, url, technologies, description }) => ({
            name,
            url: url ?? null,
            technologies,
            description,
          }));
        }
      } catch (embedErr) {
        console.warn(
          "[proposals/generate] pgvector portfolio matching failed, " +
            "continuing without portfolios:",
          embedErr,
        );
      }
    }

    const provider = body.aiProvider || "openai";

    // Build knowledge context: organization knowledge base + selected persona (if any)
    const orgKnowledge = (settings as Record<string, unknown>)
      .knowledge_base as string | undefined;

    let identityContext: string | undefined;
    if (body.personaId) {
      const { data: personaRaw } = await supabase
        .from("personas")
        .select(
          `
          full_name,
          role_title,
          bio,
          years_of_experience,
          skills,
          specializations,
          certifications,
          upwork_url,
          linkedin_url,
          website_url,
          github_url
        `,
        )
        .eq("id", body.personaId)
        .eq("user_id", tenant.userId)
        .single();

      const persona = personaRaw as PersonaIdentityFields | null;
      if (persona) {
        identityContext = buildIdentityContextFromPersona(persona);
      }
    }

    // Decide how to use org knowledge vs template based on whether a template is selected
    let finalTemplateContent = templateContent;
    let finalKnowledgeBase: string | undefined;
    // Template Mode = the user explicitly selected a template. In that mode the
    // template drives the proposal structure and the built-in 7-step framework
    // is skipped so the template layout is followed verbatim.
    let templateIsAuthority = false;

    if (finalTemplateContent) {
      templateIsAuthority = true;
      // A template WAS selected:
      // - Keep using the explicit template as the structure
      // - Use org knowledge + persona profile as background knowledge only
      const kbParts: string[] = [];
      if (orgKnowledge) {
        kbParts.push("=== AGENCY KNOWLEDGE BASE ===");
        kbParts.push(orgKnowledge);
      }
      if (identityContext) {
        if (kbParts.length > 0) kbParts.push("");
        kbParts.push("=== PROPOSAL PERSONA ===");
        kbParts.push(identityContext);
      }
      finalKnowledgeBase = kbParts.length > 0 ? kbParts.join("\n") : undefined;
    } else {
      // NO template selected:
      // - If orgKnowledge exists, treat it as the main template/structure
      // - Use only the persona profile as extra knowledge (so structure follows orgKnowledge)
      if (orgKnowledge) {
        finalTemplateContent = orgKnowledge;
      }
      finalKnowledgeBase = identityContext;
    }

    // Detect {{hook}} placeholder — lets users embed the hook inline in the template
    const hookPlaceholderRegex = /\{\{\s*hook([^}]*)?\}\}/i;
    const hookPlaceholderMatch = finalTemplateContent
      ? hookPlaceholderRegex.exec(finalTemplateContent)
      : null;
    const templateOwnsHook = hookPlaceholderMatch !== null;
    const hookPlaceholderContext = hookPlaceholderMatch?.[1]?.trim() ?? "";

    const screeningQuestionsRaw = body.screeningQuestions;
    const screeningQuestionsNormalized =
      body.includeScreening && Array.isArray(screeningQuestionsRaw)
        ? screeningQuestionsRaw
            .map((q) => String(q ?? "").trim())
            .filter(Boolean)
        : undefined;
    const includeScreening = Boolean(
      body.includeScreening &&
      screeningQuestionsNormalized &&
      screeningQuestionsNormalized.length > 0,
    );


    const generateParams = {
      jobTitle,
      jobDescription,
      clientName: body.clientName,
      experienceLevel: body.experienceLevel,
      budget: body.budget,
      duration: body.duration,
      skills: body.skills,
      notes: mergedNotes,
      templateContent: finalTemplateContent,
      portfolioProjects,
      aiProvider: provider,
      aiModel: body.aiModel,
      tone: body.tone,
      length: body.length,
      settings,
      knowledgeBase: finalKnowledgeBase,
      attachedFilesContent: body.attachedFilesContent,
      hookType: body.hookType,
      customHookInstruction: body.customHookInstruction,
      templateOwnsHook,
      templateIsAuthority,
      hookPlaceholderContext: hookPlaceholderContext || undefined,
      includeScreening,
      screeningQuestions: includeScreening
        ? screeningQuestionsNormalized
        : undefined,
    };

    if (body.stream) {
      const encoder = new TextEncoder();
      const sseStream = new ReadableStream({
        async start(controller) {
          const send = (payload: Record<string, unknown>) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
            );
          };
          try {
            const result = await streamProposal(generateParams, (delta) => {
              send({ type: "delta", text: delta });
            });
            const content = result.content || "";
            const {
              hook,
              body: extractedBody,
              wordCount,
            } = parseProposalContent(content, templateOwnsHook);
            const screeningAnswers = parseScreeningContent(content);
            send({
              type: "done",
              hook,
              body: extractedBody,
              content,
              model: result.model,
              provider: result.provider,
              wordCount,
              usage: result.usage,
              screeningAnswers: screeningAnswers ?? null,
            });
          } catch (genError) {
            // A missing key is a setup step, not a fault. `code` is what lets
            // the client say where to fix it: the class itself does not
            // survive the SSE boundary, only these two fields do.
            const message =
              genError instanceof MissingApiKeyError
                ? genError.message
                : genError instanceof Error
                  ? genError.message
                  : "Failed to generate proposal";
            send({
              type: "error",
              message,
              ...(genError instanceof MissingApiKeyError
                ? { code: MISSING_API_KEY_CODE }
                : {}),
            });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(sseStream, {
        headers: mergeCors(request, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        }),
      });
    }

    // Generate proposal (non-streaming)
    let result: Awaited<ReturnType<typeof generateProposal>>;
    try {
      result = await generateProposal(generateParams);
    } catch (genError) {
      throw genError;
    }

    console.log("Result in the generate proposal route", result);

    const content = result.content || "";
    const {
      hook: extractedHook,
      body: extractedBody,
      wordCount,
    } = parseProposalContent(content, templateOwnsHook);
    const screeningAnswers = parseScreeningContent(content);

    return NextResponse.json(
      {
        hook: extractedHook,
        body: extractedBody,
        content: content,
        model: result.model,
        provider: result.provider,
        wordCount,
        usage: result.usage,
        screeningAnswers: screeningAnswers ?? null,
      },
      {
        headers: mergeCors(request, { "Content-Type": "application/json" }),
      },
    );
  } catch (error) {
    console.error("Proposal generation error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate proposal";
    return NextResponse.json(
      { error: message },
      {
        status: 500,
        headers: mergeCors(request, { "Content-Type": "application/json" }),
      },
    );
  }

}
