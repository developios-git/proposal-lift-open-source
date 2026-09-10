import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deliverWebhook } from "@/lib/webhooks/deliver";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(
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

  // Load and verify ownership in one query.
  const { data: webhook, error: fetchError } = await supabase
    .from("webhook_configurations")
    .select("id, url, name")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError || !webhook) {
    return NextResponse.json({ error: "Webhook not found." }, { status: 404 });
  }

  const result = await deliverWebhook(webhook.url, {
    event: "test",
    run_id: `test-${Date.now()}`,
    filter: null,
    new_job_count: 0,
    jobs: [],
    notified_at: new Date().toISOString(),
  });

  // A failed delivery is a successful test that reports a failure, so this is a
  // 200 carrying `success: false` — the endpoint itself did its job.
  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        statusCode: result.statusCode,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ success: true, statusCode: result.statusCode });
}
