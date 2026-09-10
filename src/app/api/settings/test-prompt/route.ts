import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { generateProposal } from "@/lib/ai/generate";
import type { UserSettings } from "@/types";
import { NextResponse } from "next/server";

/**
 * POST /api/settings/test-prompt
 *
 * Runs one short generation against the user's saved settings so they can check
 * a key and a system prompt without leaving Settings.
 *
 * Deferred from the settings phase because it needs `generateProposal`; it lands
 * with proposal generation. Upstream also branched on org membership to load
 * `organization_settings` — there is one settings row here.
 */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let { data: userRow } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // A user who has never opened Settings has no row yet; create one so the
    // test reports "add a key" rather than "settings not found".
    if (!userRow) {
      await createSupabaseServiceClient()
        .from("user_settings")
        .upsert({ user_id: user.id }, { onConflict: "user_id" });
      const { data: again } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      userRow = again;
    }

    if (!userRow) {
      return NextResponse.json(
        { error: "Could not load your settings. Please try again." },
        { status: 400 },
      );
    }

    const settings = userRow as UserSettings;
    const defaultModel = settings.openai_model ?? "gpt-5-mini";
    const provider = defaultModel.startsWith("claude")
      ? ("anthropic" as const)
      : ("openai" as const);

    const result = await generateProposal({
      jobTitle: "Test Web Development Project",
      jobDescription:
        "Write a one-paragraph test proposal for a web development project.",
      aiProvider: provider,
      settings,
    });

    return NextResponse.json({
      content: result.content,
      model: result.model,
      provider: result.provider,
      usage: result.usage,
    });
  } catch (error) {
    console.error("Test prompt error:", error);
    // `generateProposal` throws a plain "add your key in Settings" message when
    // no key is saved, which is exactly what the user needs to read here.
    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate test response";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
