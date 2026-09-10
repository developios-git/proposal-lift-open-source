/**
 * Rewrites one selected excerpt of a proposal, streamed over SSE.
 *
 * Called by the Chrome extension's selection toolbar from the
 * `https://www.upwork.com` page origin, so every response carries CORS headers
 * and `OPTIONS` is exported. Auth is Bearer-or-cookie via
 * `createSupabaseForApiRequest`.
 *
 * Nothing from the request body is persisted or logged. The selection, the
 * surrounding proposal text, and the job posting exist only for the duration of
 * the model call. Error logs carry the failure, never the content.
 */

import type { AiEffort } from "@/lib/ai/effort";
import { streamWithOpenAI } from "@/lib/ai/openai";
import { getOpenAIApiKeyForTenant } from "@/lib/ai/openai-api-key-for-tenant";
import { mergeCors } from "@/lib/extension/cors";
import type { ProposalTenant } from "@/lib/extension/membership";
import {
  buildRefineSystemPrompt,
  buildRefineUserPrompt,
} from "@/lib/proposals/refine/build-refine-prompt";
import {
  refineRequestSchema,
  refineValidationMessage,
} from "@/lib/proposals/refine/refine-request-schema";
import {
  COMPACT_MAX_PROJECTS,
  type PortfolioCatalogProject,
  buildPortfolioCatalog,
} from "@/lib/proposals/refine/build-portfolio-catalog";
import {
  buildPortfolioNotice,
  buildPortfolioVocabulary,
  detectPortfolioIntent,
  selectPortfolioCandidates,
} from "@/lib/proposals/refine/portfolio-intent";
import { parseRefineResponse } from "@/lib/proposals/refine/parse-refine-response";
import {
  buildIdentityContextFromPersona,
  type PersonaIdentityFields,
} from "@/lib/persona-identity";
import { checkRateLimit } from "@/lib/rate-limit/check";
import { getRefineSelectionUserRatelimit } from "@/lib/rate-limit/limiters";
import { createSupabaseForApiRequest } from "@/lib/supabase/api-auth";
import { NextResponse, type NextRequest } from "next/server";

/** Refine always runs on the cheap tier: one short excerpt is not worth a premium model. */
const REFINE_MODEL = "gpt-5-mini";
const REFINE_MAX_TOKENS = 1200;
/**
 * Rewriting one selected passage is a small, well-specified job.
 *
 * This was a temperature of 0.4, chosen so Retry would give a genuinely
 * different phrasing. Effort does not control variance, so that no longer
 * follows — Retry now varies only as much as the model varies run to run.
 */
const REFINE_EFFORT: AiEffort = "medium";

const PERSONA_IDENTITY_COLUMNS = `
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
`;

type RefineTenant = ProposalTenant;

/**
 * Formatted persona fields, or undefined. Deliberately NOT gated on the 70%
 * completion rule that `/api/proposals/generate` enforces: refine is a one-line
 * edit, and refusing it until a persona is finished would be a regression.
 */
async function loadPersonaContext(
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRequest>>["supabase"],
  tenant: RefineTenant,
  personaId: string | undefined,
): Promise<string | undefined> {
  if (!personaId || !supabase) return undefined;

  const { data } = await supabase
    .from("personas")
    .select(PERSONA_IDENTITY_COLUMNS)
    .eq("id", personaId)
    .eq("user_id", tenant.userId)
    .maybeSingle();
  const persona = data as PersonaIdentityFields | null;
  return persona ? buildIdentityContextFromPersona(persona) : undefined;
}

/** The tenant's knowledge base text, or undefined. One narrow column, not the whole settings row. */
async function loadKnowledgeBase(
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRequest>>["supabase"],
  tenant: RefineTenant,
): Promise<string | undefined> {
  if (!supabase) return undefined;

  const { data } = await supabase
    .from("user_settings")
    .select("knowledge_base")
    .eq("user_id", tenant.userId)
    .maybeSingle();

  const raw = (data as { knowledge_base?: string | null } | null)?.knowledge_base;
  return raw?.trim() ? raw : undefined;
}

/**
 * The tenant's portfolio rows, or an empty list.
 *
 * Runs unconditionally, because the vocabulary used to spot a category mention
 * is derived from these rows: categories are free text the user authored, so
 * there is no fixed list to match against first. The trade is deliberate. This
 * query is small and runs in parallel with the persona and knowledge base
 * reads, while the thing the intent gate actually protects is prompt size and
 * model behaviour, not database load.
 */
async function loadPortfolioProjects(
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRequest>>["supabase"],
  tenant: RefineTenant,
): Promise<PortfolioCatalogProject[]> {
  if (!supabase) return [];

  const { data } = await supabase
    .from("projects")
    .select("name, category, url, description, technologies")
    .eq("user_id", tenant.userId)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(COMPACT_MAX_PROJECTS);

  return (data as PortfolioCatalogProject[] | null) ?? [];
}

function corsJson(
  request: NextRequest,
  body: Record<string, unknown>,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: mergeCors(request, {
      "Content-Type": "application/json",
      ...extraHeaders,
    }),
  });
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: mergeCors(request, {}) });
}

export async function POST(request: NextRequest) {
    try {
      const auth = await createSupabaseForApiRequest(request);
      if (!auth.user || !auth.supabase) {
        return corsJson(request, { error: "Unauthorized" }, 401);
      }
      const { supabase, user } = auth;

      // Same gate /api/proposals/generate applies. Without it an account in
      // PENDING_VERIFICATION, UNINITIALIZED, or PAYMENT_PENDING is locked out
      // of the dashboard and refused by generate, yet can still spend credits
      // here.

      const blocked = await checkRateLimit(
        getRefineSelectionUserRatelimit(),
        user.id,
      );
      if (blocked) {
        return corsJson(
          request,
          { error: "Too many requests. Please wait a moment and try again." },
          429,
          { "Retry-After": String(blocked.retryAfterSec) },
        );
      }

      const parsedBody = refineRequestSchema.safeParse(await request.json());
      if (!parsedBody.success) {
        return corsJson(
          request,
          { error: refineValidationMessage(parsedBody.error) },
          400,
        );
      }
      const body = parsedBody.data;

      const tenant: ProposalTenant = { userId: user.id };

      // A Bearer request carries no cookies, so middleware found no user and

      const apiKey = await getOpenAIApiKeyForTenant(supabase, tenant);
      if (!apiKey) {
        return corsJson(
          request,
          {
            error:
              "Add your OpenAI API key in Settings to refine a passage.",
          },
          400,
        );
      }

      // All three are optional and best-effort: a user with no persona, no
      // knowledge base, and no portfolio still gets a rewrite, just a less
      // grounded one.
      const [personaContext, knowledgeBase, portfolioProjects] =
        await Promise.all([
          loadPersonaContext(supabase, tenant, body.personaId),
          loadKnowledgeBase(supabase, tenant),
          loadPortfolioProjects(supabase, tenant),
        ]);

      // The catalog is withheld unless the instruction asks for project work.
      // Not sending it is a stronger guarantee than a prompt rule: the model
      // cannot volunteer a link to work it was never shown.
      const portfolioIntent = detectPortfolioIntent(
        body.instruction,
        buildPortfolioVocabulary(portfolioProjects),
      );
      const portfolioCandidates = portfolioIntent.wanted
        ? selectPortfolioCandidates(portfolioProjects, portfolioIntent)
        : [];
      const portfolioCatalog =
        buildPortfolioCatalog(portfolioCandidates) || undefined;

      // Deducted last, after every fallible read. The refund paths live inside
      // the stream body, so a database failure above this line would land in
      // the outer catch and bill the user for a rewrite that never ran.
      // Everything between here and the stream is pure prompt assembly.

      const systemPrompt = buildRefineSystemPrompt();
      const userPrompt = buildRefineUserPrompt({
        selection: body.selection,
        instruction: body.instruction,
        personaContext,
        knowledgeBase,
        portfolioCatalog,
        contextBefore: body.contextBefore,
        contextAfter: body.contextAfter,
        jobTitle: body.jobTitle,
        jobDescription: body.jobDescription,
      });

      const encoder = new TextEncoder();
      const sseStream = new ReadableStream({
        async start(controller) {
          const send = (payload: Record<string, unknown>) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
            );
          };
          try {
            const result = await streamWithOpenAI(
              apiKey,
              {
                systemPrompt,
                userPrompt,
                model: REFINE_MODEL,
                effort: REFINE_EFFORT,
                maxTokens: REFINE_MAX_TOKENS,
              },
              (delta) => send({ type: "delta", text: delta }),
            );

            const text = parseRefineResponse(result.content || "");
            if (!text) {
              send({
                type: "error",
                message: "The rewrite came back empty. Please try again.",
              });
              return;
            }

            // Judged against what the model actually produced. Free-text
            // categories mean an empty candidate list cannot prove "you have no
            // Shopify project", so the signal is whether the finished rewrite
            // used any project we supplied.
            const notice = buildPortfolioNotice({
              intent: portfolioIntent,
              candidates: portfolioCandidates,
              rewrittenText: text,
            });

            send({
              type: "done",
              text,
              model: result.model,
              provider: result.provider,
              ...(notice ? { notice } : {}),
            });
          } catch (genError) {
            // Message only; the prompt and its content never reach the log.
            console.error(
              "[proposals/refine-selection] AI error:",
              genError instanceof Error ? genError.message : "unknown",
            );
            send({
              type: "error",
              message: "Could not rewrite that passage. Please try again.",
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
    } catch (error) {
      console.error(
        "[proposals/refine-selection] error:",
        error instanceof Error ? error.message : "unknown",
      );
      return corsJson(
        request,
        { error: "Could not rewrite that passage." },
        500,
      );
    }
}
