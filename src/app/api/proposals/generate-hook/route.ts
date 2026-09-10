import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import type { ProposalTenant } from "@/lib/extension/membership";
import { generateHookOnly, streamHookOnly } from "@/lib/ai/generate";
import {
  MISSING_API_KEY_CODE,
  MissingApiKeyError,
} from "@/lib/ai/keys";
import { NextResponse, type NextRequest } from "next/server";
import type { UserSettings } from "@/types";

function sanitizeHookContent(raw: string): string {
  return raw
    .replace(/<\/?(?:hook|body)>/gi, "")
    .trim()
    .replace(/[\u2014\u2013]/g, ",");
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
          { status: 400 },
        );
      }

    const settings = userRow as UserSettings;

    const body = (await request.json()) as {
      jobTitle?: string;
      jobDescription?: string;
      clientName?: string;
      tone?: string;
      aiProvider?: "openai" | "anthropic";
      aiModel?: string;
      hookType?: string;
      customHookInstruction?: string;
      stream?: boolean;
    };

    if (!body.jobTitle || !body.jobDescription) {
      return NextResponse.json(
        { error: "Job title and description are required" },
        { status: 400 },
      );
    }

    const provider = body.aiProvider || "openai";

    const generateParams = {
      jobTitle: body.jobTitle,
      clientName: body.clientName,
      jobDescription: body.jobDescription,
      tone: body.tone,
      aiProvider: provider,
      aiModel: body.aiModel,
      settings,
      hookType: body.hookType,
      customHookInstruction: body.customHookInstruction,
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
            const result = await streamHookOnly(generateParams, (delta) => {
              send({ type: "delta", text: delta });
            });
            const extractedHook = sanitizeHookContent(result.content || "");
            send({
              type: "done",
              hook: extractedHook,
              model: result.model,
              provider: result.provider,
              usage: result.usage,
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
                  : "Failed to generate hook";
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
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    let result: Awaited<ReturnType<typeof generateHookOnly>>;
    try {
      result = await generateHookOnly(generateParams);
    } catch (genError) {
      throw genError;
    }

    const extractedHook = sanitizeHookContent(result.content || "");

    return NextResponse.json({
      hook: extractedHook,
      model: result.model,
      provider: result.provider,
      usage: result.usage,
    });
  } catch (error) {
    console.error("Hook generation error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate hook";
    return NextResponse.json({ error: message }, { status: 500 });
  }

}
