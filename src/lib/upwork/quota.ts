import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const UPWORK_DAILY_LIMIT = 37_000;

/**
 * Whose daily Upwork budget a call counts against.
 *
 * Upstream this was `{ userId?, organizationId? }` and had to be *resolved*:
 * a user on an agency plan spent their organization's shared quota instead of
 * their own. There are no organizations and no plans here, so it is always the
 * calling user, and the resolution step is gone with
 * `resolveUpworkQuotaContext` — construct `{ userId }` at the call site.
 */
export type UpworkQuotaContext = { userId: string };

export class UpworkQuotaExceededError extends Error {
  readonly used: number;
  readonly limit: number;
  readonly resetAt: string;

  constructor(used: number, limit: number, resetAt: string) {
    super("Daily Upwork API limit reached. Resets at midnight UTC.");
    this.name = "UpworkQuotaExceededError";
    this.used = used;
    this.limit = limit;
    this.resetAt = resetAt;
  }
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function midnightUtcResetAt(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

/**
 * Atomically increment the daily Upwork API call counter and check whether the
 * call is allowed under the daily quota.
 *
 * Returns `{ allowed: true }` when under the limit. When already over, the
 * counter is NOT incremented — the count is read first, and the increment only
 * happens if there is room.
 *
 * `upwork_api_usage` is SELECT-only under RLS; the write belongs to the
 * `increment_upwork_api_usage` SECURITY DEFINER RPC, which is why this uses the
 * service client.
 */
export async function checkAndIncrementUpworkQuota(
  ctx: UpworkQuotaContext,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const supabase = createSupabaseServiceClient();
  const date = todayUtcDate();

  const currentCount = await getCurrentCount(supabase, ctx, date);

  if (currentCount >= UPWORK_DAILY_LIMIT) {
    return { allowed: false, used: currentCount, limit: UPWORK_DAILY_LIMIT };
  }

  // Named arguments: the RPC lost its `p_organization_id` parameter in this
  // schema, so passing one would fail to resolve the function.
  const { data, error } = await supabase.rpc("increment_upwork_api_usage", {
    p_user_id: ctx.userId,
    p_date: date,
  });

  if (error) {
    console.error("[upwork-quota] increment error:", error);
    // Fail open — a broken counter must not block real work.
    return { allowed: true, used: currentCount, limit: UPWORK_DAILY_LIMIT };
  }

  const newCount = data as number;
  return {
    allowed: newCount <= UPWORK_DAILY_LIMIT,
    used: newCount,
    limit: UPWORK_DAILY_LIMIT,
  };
}

/** Read the current day's Upwork API usage for display in the UI. */
export async function getUpworkQuotaUsage(ctx: UpworkQuotaContext): Promise<{
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
}> {
  const supabase = createSupabaseServiceClient();
  const used = await getCurrentCount(supabase, ctx, todayUtcDate());
  const remaining = Math.max(0, UPWORK_DAILY_LIMIT - used);
  return {
    used,
    limit: UPWORK_DAILY_LIMIT,
    remaining,
    resetAt: midnightUtcResetAt(),
  };
}

async function getCurrentCount(
  supabase: SupabaseClient<Database>,
  ctx: UpworkQuotaContext,
  date: string,
): Promise<number> {
  try {
    const { data } = await supabase
      .from("upwork_api_usage")
      .select("call_count")
      .eq("date", date)
      .eq("user_id", ctx.userId)
      .maybeSingle();

    return data?.call_count ?? 0;
  } catch {
    return 0;
  }
}
