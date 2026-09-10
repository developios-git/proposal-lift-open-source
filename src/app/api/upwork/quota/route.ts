import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUpworkQuotaUsage } from "@/lib/upwork/quota";
import { NextResponse } from "next/server";

/**
 * GET /api/upwork/quota
 *
 * The current day's Upwork API usage for the signed-in user, for the settings
 * page quota widget.
 *
 * Upstream resolved a quota context first, because an agency-plan user spent
 * their organization's shared quota. Here it is always the caller's own.
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

  const usage = await getUpworkQuotaUsage({ userId: user.id });

  return NextResponse.json(usage);
}
