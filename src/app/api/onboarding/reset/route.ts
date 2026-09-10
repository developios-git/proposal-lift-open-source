import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  flow_id: z.string().min(1),
});

/**
 * Deletes an onboarding row so the flow runs again.
 *
 * A missing row reads as "never started" everywhere, so deleting is what
 * re-arms it: for `first_run_getting_started` the next sign-in lands on
 * `/getting-started` again.
 *
 * Scoped to the caller's own row. Upstream noted an org-owner bulk reset as
 * out of scope; there are no orgs here, so there is nothing to scope beyond
 * `user_id`.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_onboarding_state")
    .delete()
    .eq("user_id", user.id)
    .eq("flow_id", parsed.data.flow_id);

  if (error) {
    console.error("onboarding reset:", error.message);
    return NextResponse.json(
      { error: "Failed to reset onboarding" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
