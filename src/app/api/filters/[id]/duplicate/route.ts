import type { ProposalTenant } from "@/lib/extension/membership";
import { MAX_FILTERS_PER_USER, atFilterLimit } from "@/lib/filters/filter-limits";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(_request: Request,
  { params }: { params: Promise<{ id: string }> },) {
  try {
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

    let fetchQuery = supabase
      .from("saved_job_filters")
      .select("*")
      .eq("id", id);

    fetchQuery = fetchQuery.eq("user_id", tenant.userId);

    const { data: source, error: fetchError } = await fetchQuery.single();

    if (fetchError || !source) {
      return NextResponse.json(
        { error: "Filter not found" },
        { status: 404 },
      );
    }

    // Duplicating creates a row like any other create, so it has to honour the
    // same cap — guarding only POST /api/filters would leave this as a way
    // around it. Checked after the source is resolved so a bad id still reads
    // as 404 rather than as a limit error.
    const { count: ownedFilters, error: countError } = await supabase
      .from("saved_job_filters")
      .select("id", { count: "exact", head: true })
      .eq("user_id", tenant.userId);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    if (atFilterLimit(ownedFilters ?? 0)) {
      return NextResponse.json(
        {
          error: `You can save at most ${MAX_FILTERS_PER_USER} filters. Delete one to make room.`,
          code: "filter_limit",
        },
        { status: 400 },
      );
    }

    const insertPayload = {
      user_id: tenant.userId,
      name: `${source.name} (Copy)`,
      filters: source.filters || {},
      is_default: false,
      notification_enabled: source.notification_enabled ?? false,
      auto_refresh_jobs_enabled: source.auto_refresh_jobs_enabled ?? false,
      // A copy always starts enabled, even from a disabled source: you
      // duplicate a filter because you intend to use it.
      is_enabled: true,
    };

    const { data: filter, error: insertError } = await supabase
      .from("saved_job_filters")
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ filter });
  } catch (error) {
    console.error("POST /api/filters/[id]/duplicate:", error);
    return NextResponse.json(
      { error: "Failed to duplicate filter" },
      { status: 500 },
    );
  }

}
