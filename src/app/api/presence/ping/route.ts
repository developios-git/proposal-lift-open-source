import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/presence/ping
 *
 * Called by the client every 2 minutes while the browser tab is visible.
 * Upserts a `user_presence` row so the job-alert cron can tell whether the user
 * is currently online before sending a webhook — if they are, the in-app alert
 * handles it and the webhook is skipped.
 *
 * Offline threshold: last_seen_at < now() - interval '5 minutes'
 *
 * Upstream needed an `any` cast here because `user_presence` predated the
 * generated types. It is in them now, so the upsert is fully typed.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("user_presence")
    .upsert(
      { user_id: user.id, last_seen_at: now, updated_at: now },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("[presence/ping] upsert error:", error);
    return NextResponse.json(
      { error: "Failed to update presence" },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
