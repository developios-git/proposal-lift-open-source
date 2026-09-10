import {
  buildGettingStartedSteps,
  hasAiKeyContent,
  hasKnowledgeBaseContent,
  hasPersonalUpworkCredentials,
} from "@/lib/onboarding/getting-started-steps";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Counts behind the Getting Started checklist and the sidebar's setup badge.
 *
 * Upstream ran every query twice — once against the org tables, once against
 * the user's — resolved a tenant to pick between them, and called
 * `getBillingContext` to decide which of two step orders to return. One owner,
 * one set of tables, one order.
 *
 * `sharedConnectAvailable` is gone with it: there is no platform Upwork app to
 * offer.
 */

const SETTINGS_COLUMNS =
  "openai_api_key, upwork_access_token, upwork_client_id, upwork_client_secret_encrypted, knowledge_base";

type SettingsRow = {
  openai_api_key: string | null;
  upwork_access_token: string | null;
  upwork_client_id: string | null;
  upwork_client_secret_encrypted: string | null;
  knowledge_base: string | null;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const countFor = (table: "saved_job_filters" | "personas" | "projects" | "hooks") =>
    supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

  const [
    settingsResult,
    filtersResult,
    personasResult,
    projectsResult,
    templatesResult,
    hooksResult,
  ] = await Promise.all([
    supabase
      .from("user_settings")
      .select(SETTINGS_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle(),

    countFor("saved_job_filters"),
    countFor("personas"),
    countFor("projects"),

    // The signup seeder inserts one `is_default` template, which the user did
    // not create — counting it would tick "Create Templates" on day one.
    //
    // `not("is_default", "is", true)` rather than upstream's
    // `neq("is_default", true)`: the column is nullable, and `is_default <> true`
    // evaluates to NULL for a NULL row, so `neq` silently drops every template
    // inserted without the flag set.
    supabase
      .from("templates")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("is_default", "is", true),

    countFor("hooks"),
  ]);

  const settings = (settingsResult.data ?? null) as SettingsRow | null;

  const steps = buildGettingStartedSteps({
    hasAiKey: hasAiKeyContent(settings?.openai_api_key),
    upworkConnected: Boolean(settings?.upwork_access_token),
    hasPersonalUpworkCredentials: hasPersonalUpworkCredentials(
      settings?.upwork_client_id,
      settings?.upwork_client_secret_encrypted,
    ),
    hasKnowledgeBase: hasKnowledgeBaseContent(settings?.knowledge_base),
    filterCount: filtersResult.count ?? 0,
    personaCount: personasResult.count ?? 0,
    projectCount: projectsResult.count ?? 0,
    templateCount: templatesResult.count ?? 0,
    hookCount: hooksResult.count ?? 0,
  });

  return NextResponse.json({
    steps,
    completedCount: steps.filter((s) => s.done).length,
    totalCount: steps.length,
  });
}
