import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Counts for the dashboard.
 *
 * Upstream branched on whether the user had an active organization: the org arm
 * counted org-scoped rows plus `organization_members`, the solo arm counted
 * user-scoped rows, and the response carried `hasOrganization` and `memberCount`
 * so the page could render either. Neither field exists any more — there is one
 * arm, and `proposals.created_by` collapsed into `user_id` with the schema.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [
      proposalCountResult,
      projectCountResult,
      templateCountResult,
      recentProposalsResult,
    ] = await Promise.all([
      supabase
        .from("proposals")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("templates")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("proposals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    return NextResponse.json({
      proposalCount: proposalCountResult.count ?? 0,
      projectCount: projectCountResult.count ?? 0,
      templateCount: templateCountResult.count ?? 0,
      recentProposals: recentProposalsResult.data ?? [],
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
