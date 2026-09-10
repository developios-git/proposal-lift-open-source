import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CURRENT_FLOW_VERSION,
  type OnboardingFlowId,
} from "@/lib/onboarding/constants";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

/**
 * Read and write one row of `user_onboarding_state` for the signed-in user.
 *
 * Upstream every query carried an optional `organization_id`, so each one had
 * an `.eq(org)` / `.is(null)` fork. The column does not exist here: the table is
 * unique on `(user_id, flow_id)`, which is the whole key.
 *
 * The only flow that currently writes here is `first_run_getting_started` —
 * marked completed the first time the user is shown the checklist, so
 * `resolvePostAuthRedirect` stops sending them there on every sign-in.
 */

const getQuerySchema = z.object({
  flow_id: z.string().min(1),
});

const patchBodySchema = z.object({
  flow_id: z.string().min(1),
  flow_version: z.number().int().positive().optional(),
  status: z.enum(["not_started", "in_progress", "completed", "skipped"]),
  current_step: z.number().int().min(0).optional(),
  completed_at: z.string().nullable().optional(),
  skipped_at: z.string().nullable().optional(),
});

function flowVersionFor(flowId: string): number {
  if (flowId in CURRENT_FLOW_VERSION) {
    return CURRENT_FLOW_VERSION[flowId as OnboardingFlowId];
  }
  return 1;
}

/** GET — current row for the signed-in user and flow. */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = getQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_onboarding_state")
    .select("*")
    .eq("user_id", user.id)
    .eq("flow_id", parsed.data.flow_id)
    .maybeSingle();

  if (error) {
    console.error("onboarding GET:", error.message);
    return NextResponse.json(
      { error: "Failed to load onboarding" },
      { status: 500 },
    );
  }

  return NextResponse.json({ row: data });
}

/** PATCH — upsert the onboarding row for the signed-in user only. */
export async function PATCH(request: NextRequest) {
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

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const {
    flow_id,
    flow_version: bodyFlowVersion,
    status,
    current_step,
    completed_at,
    skipped_at,
  } = parsed.data;

  const flow_version = bodyFlowVersion ?? flowVersionFor(flow_id);

  // Only the fields actually sent are written, so a PATCH that moves the status
  // does not reset a `current_step` it said nothing about. That is why this is
  // a select-then-write rather than a plain upsert.
  const updatePayload = {
    flow_version,
    status,
    ...(current_step !== undefined ? { current_step } : {}),
    ...(completed_at !== undefined ? { completed_at } : {}),
    ...(skipped_at !== undefined ? { skipped_at } : {}),
  };

  const updateExisting = () =>
    supabase
      .from("user_onboarding_state")
      .update(updatePayload)
      .eq("user_id", user.id)
      .eq("flow_id", flow_id)
      .select()
      .single();

  const { data: existing, error: selErr } = await supabase
    .from("user_onboarding_state")
    .select("id")
    .eq("user_id", user.id)
    .eq("flow_id", flow_id)
    .maybeSingle();

  if (selErr) {
    console.error("onboarding PATCH select:", selErr.message);
    return NextResponse.json(
      { error: "Failed to save onboarding" },
      { status: 500 },
    );
  }

  if (existing?.id) {
    const { data, error } = await updateExisting();
    if (error) {
      console.error("onboarding PATCH update:", error.message);
      return NextResponse.json(
        { error: "Failed to save onboarding" },
        { status: 500 },
      );
    }
    return NextResponse.json({ row: data });
  }

  const { data, error } = await supabase
    .from("user_onboarding_state")
    .insert({
      user_id: user.id,
      flow_id,
      flow_version,
      status,
      current_step: current_step ?? 0,
      ...(completed_at !== undefined ? { completed_at } : {}),
      ...(skipped_at !== undefined ? { skipped_at } : {}),
    })
    .select()
    .single();

  if (error) {
    // 23505 = the `(user_id, flow_id)` unique constraint. Two tabs raced to
    // create the same row; the other one won, so write to it instead of
    // failing a request that asked for a state the row can still reach.
    if (error.code === "23505") {
      const { data: updated, error: updateErr } = await updateExisting();
      if (!updateErr) return NextResponse.json({ row: updated });
    }
    console.error("onboarding PATCH insert:", error.message);
    return NextResponse.json(
      { error: "Failed to save onboarding" },
      { status: 500 },
    );
  }

  return NextResponse.json({ row: data });
}
