import type { ProposalTenant } from "@/lib/extension/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (supabase: any) => supabase as any;

/**
 * GET /api/filters/[id]/notified-jobs
 *
 * Returns the notified_job_ids array for a saved filter so the browser-side
 * job alert tracker can initialize its baseline from DB state instead of
 * in-memory state. This prevents the browser from re-notifying about jobs
 * that were already sent as webhook notifications while the user was offline.
 *
 * Returns { notified_job_ids: string[] } — empty array if no state row exists.
 */
export async function GET(_request: Request,
    { params }: { params: Promise<{ id: string }> },) {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant: ProposalTenant = { userId: user.id };

    // Verify the filter belongs to this tenant before returning state
    let filterQuery = supabase
      .from("saved_job_filters")
      .select("id")
      .eq("id", id);

    filterQuery = filterQuery.eq("user_id", tenant.userId);

    const { data: filter, error: filterError } = await filterQuery.maybeSingle();
    if (filterError || !filter) {
      return NextResponse.json({ error: "Filter not found." }, { status: 404 });
    }

    // Read webhook state via service role (filter_webhook_state has no insert RLS for anon)
    const serviceClient = createSupabaseServiceClient();
    const { data: state } = await db(serviceClient)
      .from("filter_webhook_state")
      .select("notified_job_ids")
      .eq("filter_id", id)
      .maybeSingle();

    return NextResponse.json({
      notified_job_ids: state?.notified_job_ids ?? [],
    });
}
