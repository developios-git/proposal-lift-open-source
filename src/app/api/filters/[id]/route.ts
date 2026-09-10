import type { ProposalTenant } from "@/lib/extension/membership";
import {
  MAX_FILTER_KEYWORD_TERMS,
  MAX_KEYWORD_LENGTH,
  countKeywordTerms,
  exceedsKeywordLength,
  exceedsKeywordLimit,
} from "@/lib/filters/keyword-limits";
import { QUALIFY_CRITERIA_MAX_LENGTH } from "@/lib/jobs/qualify/constants";
import type { Database } from "@/types/database";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";


export async function PATCH(request: Request,
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

    const body = await request.json();
    const {
      name,
      filters,
      auto_refresh_jobs_enabled,
      qualify_criteria,
      qualify_enabled,
      is_enabled,
    } = body;

    const updates: Database["public"]["Tables"]["saved_job_filters"]["Update"] = {};
    if (name !== undefined && typeof name === "string") {
      updates.name = name.trim() || "Untitled";
    }
    if (filters !== undefined && typeof filters === "object") {
      // Keywords are capped two ways — how many, and how long each one is — and
      // both caps block only growth: a filter saved before either cap keeps its
      // keywords and stays editable, so the user can still rename or re-scope it
      // while it sits over the limit. Shrinking an over-limit list always goes
      // through, even while still above the cap.
      //
      // Both pre-checks below are pure, and each is the cap as a plain ceiling.
      // Only when one of them trips does the prior row need reading to tell a
      // grandfathered keyword from a newly added one, so the common save still
      // costs no extra query — and a save that trips both spends one read, not two.
      const overTermCount =
        countKeywordTerms(filters) > MAX_FILTER_KEYWORD_TERMS;
      const overTermLength = exceedsKeywordLength(filters, null);

      if (overTermCount || overTermLength) {
        const { data: existing } = await supabase
          .from("saved_job_filters")
          .select("filters")
          .eq("id", id)
          .eq("user_id", tenant.userId)
          .single();
        if (overTermCount && exceedsKeywordLimit(filters, existing?.filters)) {
          return NextResponse.json(
            { error: `At most ${MAX_FILTER_KEYWORD_TERMS} keywords per filter` },
            { status: 400 },
          );
        }
        if (overTermLength && exceedsKeywordLength(filters, existing?.filters)) {
          return NextResponse.json(
            {
              error: `Each keyword must be ${MAX_KEYWORD_LENGTH} characters or fewer`,
            },
            { status: 400 },
          );
        }
      }
      updates.filters = filters;
    }
    if (auto_refresh_jobs_enabled !== undefined) {
      if (typeof auto_refresh_jobs_enabled !== "boolean") {
        return NextResponse.json(
          { error: "auto_refresh_jobs_enabled must be a boolean" },
          { status: 400 },
        );
      }
      updates.auto_refresh_jobs_enabled = auto_refresh_jobs_enabled;
    }
    // AI Job Qualify. Both fields are independent so the status dropdown can
    // write `qualify_enabled` alone without resending the criteria text.
    if (qualify_criteria !== undefined) {
      if (qualify_criteria !== null && typeof qualify_criteria !== "string") {
        return NextResponse.json(
          { error: "qualify_criteria must be a string or null" },
          { status: 400 },
        );
      }
      const trimmed =
        typeof qualify_criteria === "string" ? qualify_criteria.trim() : "";
      if (trimmed.length > QUALIFY_CRITERIA_MAX_LENGTH) {
        return NextResponse.json(
          {
            error: `qualify_criteria must be ${QUALIFY_CRITERIA_MAX_LENGTH} characters or fewer`,
          },
          { status: 400 },
        );
      }
      updates.qualify_criteria = trimmed || null;
    }
    if (qualify_enabled !== undefined) {
      if (typeof qualify_enabled !== "boolean") {
        return NextResponse.json(
          { error: "qualify_enabled must be a boolean" },
          { status: 400 },
        );
      }
      updates.qualify_enabled = qualify_enabled;
    }
    // Whole-filter on/off. A disabled filter is skipped by every Upwork-calling
    // surface and its page redirects away.
    if (is_enabled !== undefined) {
      if (typeof is_enabled !== "boolean") {
        return NextResponse.json(
          { error: "is_enabled must be a boolean" },
          { status: 400 },
        );
      }
      updates.is_enabled = is_enabled;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    let updateQuery = supabase
      .from("saved_job_filters")
      .update(updates)
      .eq("id", id);

    updateQuery = updateQuery.eq("user_id", tenant.userId);

    const { data: filter, error } = await updateQuery.select().single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    // When filter criteria changes, reset the webhook dedup state so the cron
    // establishes a fresh baseline instead of comparing against stale job IDs.
    // Re-enabling has the same staleness problem: `notified_job_ids` is frozen
    // at the pre-disable set, so without a reset the first cron run after
    // re-enabling would fire a burst of notifications for everything posted
    // while the filter was off.
    if (filters !== undefined || is_enabled === true) {
      const serviceClient = createSupabaseServiceClient();
      await serviceClient
        .from("filter_webhook_state")
        .update({
          notified_job_ids: [],
          baseline_pending: true,
          last_notified_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("filter_id", id);
      // Best-effort: silently ignore if the row doesn't exist yet.
    }

    return NextResponse.json({ filter });
  } catch {
    return NextResponse.json(
      { error: "Failed to update filter" },
      { status: 500 },
    );
  }

}

export async function DELETE(_request: Request,
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

    let deleteQuery = supabase.from("saved_job_filters").delete().eq("id", id);

    deleteQuery = deleteQuery.eq("user_id", tenant.userId);

    const { error } = await deleteQuery;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete filter" },
      { status: 500 },
    );
  }

}
