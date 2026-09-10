import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateWebhookUrl } from "@/lib/webhooks/validate-url";
import type { Database } from "@/types/database";
import { NextResponse, type NextRequest } from "next/server";

type WebhookUpdate =
  Database["public"]["Tables"]["webhook_configurations"]["Update"];

/**
 * The `.eq("user_id", …)` on each query is ownership enforcement, not just a
 * filter: it is what makes a request for someone else's webhook id a 404 rather
 * than an edit. RLS backs it up, but the explicit predicate keeps the intent
 * visible at the call site.
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { name, url, is_active } = body;

  const updates: WebhookUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Name cannot be empty." },
        { status: 400 },
      );
    }
    updates.name = name.trim();
  }

  if (url !== undefined) {
    if (typeof url !== "string") {
      return NextResponse.json(
        { error: "URL must be a string." },
        { status: 400 },
      );
    }
    const urlValidation = validateWebhookUrl(url);
    if (!urlValidation.valid) {
      return NextResponse.json({ error: urlValidation.error }, { status: 400 });
    }
    updates.url = url.trim();
  }

  if (is_active !== undefined) {
    if (typeof is_active !== "boolean") {
      return NextResponse.json(
        { error: "is_active must be a boolean." },
        { status: 400 },
      );
    }
    updates.is_active = is_active;
    // Re-enabling clears the failure counter, or a webhook auto-disabled by
    // repeated failures would be disabled again on the next delivery.
    if (is_active) {
      updates.consecutive_failures = 0;
      updates.last_failure_at = null;
    }
  }

  // Only `updated_at` present means the body carried nothing actionable.
  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  const { data: webhook, error: updateError } = await supabase
    .from("webhook_configurations")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!webhook) {
    return NextResponse.json({ error: "Webhook not found." }, { status: 404 });
  }

  return NextResponse.json({ webhook });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error: deleteError } = await supabase
    .from("webhook_configurations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
