import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * PATCH /api/settings/job-feed-auto-refresh
 *
 * Its own route rather than a field on PUT /api/settings because the filter feed
 * toggles it on its own, without submitting the whole settings form.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { enabled } = body as { enabled?: unknown };
    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled (boolean) is required" },
        { status: 400 },
      );
    }

    const { error } = await createSupabaseServiceClient()
      .from("user_settings")
      .upsert(
        {
          user_id: user.id,
          job_feed_auto_refresh_enabled: enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (error) {
      console.error("job_feed_auto_refresh update:", error);
      return NextResponse.json(
        { error: "Failed to update preference" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      job_feed_auto_refresh_enabled: enabled,
    });
  } catch (e) {
    console.error("job-feed-auto-refresh:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
