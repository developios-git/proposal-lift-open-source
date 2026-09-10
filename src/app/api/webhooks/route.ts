import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateWebhookUrl } from "@/lib/webhooks/validate-url";
import { resolveWebhookEligibility } from "@/lib/webhooks/eligibility";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Upstream both handlers resolved a tenant and then branched the query between
 * `organization_id` and `user_id`, and needed an `any` cast because
 * `webhook_configurations` predated the generated types. Neither applies here:
 * rows are user-owned and the table is in `database.ts`.
 *
 * `created_by_user_id` is gone from the schema too — with one owner it was
 * always equal to `user_id`.
 */

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: webhooks, error } = await supabase
    .from("webhook_configurations")
    .select(
      "id, name, platform_hint, url, is_active, consecutive_failures, last_failure_at, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const eligibility = await resolveWebhookEligibility(supabase, {
    userId: user.id,
  });

  return NextResponse.json({ webhooks: webhooks ?? [], eligibility });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Gate creation: Upwork must be connected AND there must be ≥1 filter, or the
  // cron has nothing to poll and nothing to deliver.
  const eligibility = await resolveWebhookEligibility(supabase, {
    userId: user.id,
  });
  if (!eligibility.canCreate) {
    return NextResponse.json(
      { error: eligibility.reason, code: eligibility.code },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const { name, url } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required." }, { status: 400 });
  }

  const urlValidation = validateWebhookUrl(url);
  if (!urlValidation.valid) {
    return NextResponse.json({ error: urlValidation.error }, { status: 400 });
  }

  const { data: webhook, error: insertError } = await supabase
    .from("webhook_configurations")
    .insert({
      name: name.trim(),
      platform_hint: "custom",
      url: url.trim(),
      user_id: user.id,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ webhook }, { status: 201 });
}
