import { MAX_FILTERS_PER_USER, atFilterLimit } from "@/lib/filters/filter-limits";
import {
  MAX_FILTER_KEYWORD_TERMS,
  MAX_KEYWORD_LENGTH,
  exceedsKeywordLength,
  exceedsKeywordLimit,
} from "@/lib/filters/keyword-limits";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

    // Upstream capped the list at a per-plan `maxFilters` and returned both it
    // and the plan name. There are no plans, so filters are unlimited and
    // neither field is reported.
    const { data: filters, error } = await supabase
      .from("saved_job_filters")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ filters: filters || [] });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch filters" },
      { status: 500 },
    );
  }

}

export async function POST(request: Request) {
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
    const { name, filters = {}, auto_refresh_jobs_enabled } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // A new filter has no prior state, so the include-keyword cap is a plain
    // ceiling here. Only a direct API caller can trip it: useCreateFilter always
    // posts DEFAULT_FILTER_CRITERIA, which has no terms.
    if (exceedsKeywordLimit(filters, null)) {
      return NextResponse.json(
        { error: `At most ${MAX_FILTER_KEYWORD_TERMS} keywords per filter` },
        { status: 400 },
      );
    }

    // A create has no prior terms either, so the length cap is a plain ceiling
    // here too. Covers exclude keywords as well as include ones.
    if (exceedsKeywordLength(filters, null)) {
      return NextResponse.json(
        {
          error: `Each keyword must be ${MAX_KEYWORD_LENGTH} characters or fewer`,
        },
        { status: 400 },
      );
    }

    // The count cap is checked last of the create-time guards: it costs a
    // query, and a malformed body should be rejected without one. RLS already
    // scopes the table to this user; the explicit filter matches the style of
    // every other query here and keeps the count right if that ever changes.
    const { count: ownedFilters, error: countError } = await supabase
      .from("saved_job_filters")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

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

    const refreshEnabled =
      typeof auto_refresh_jobs_enabled === "boolean"
        ? auto_refresh_jobs_enabled
        : false;

    const insertPayload = {
      user_id: user.id,
      name: name.trim(),
      filters: filters || {},
      notification_enabled: false,
      auto_refresh_jobs_enabled: refreshEnabled,
      is_enabled: true,
    };

    const { data: filter, error } = await supabase
      .from("saved_job_filters")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ filter });
  } catch {
    return NextResponse.json(
      { error: "Failed to create filter" },
      { status: 500 },
    );
  }

}
