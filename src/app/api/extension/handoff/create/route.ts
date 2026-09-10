import { randomBytes } from "node:crypto";
import { checkRateLimit } from "@/lib/rate-limit/check";
import { getHandoffCreateUserRatelimit } from "@/lib/rate-limit/limiters";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Mint a one-time code the extension can exchange for a session.
 *
 * Called by the consent screen at `/extension/handoff`, same-origin, so there
 * is deliberately no CORS and no `OPTIONS` here. The extension never calls this
 * route — it only ever calls `redeem`.
 *
 * **Cookie session only, not Bearer.** `createSupabaseForApiRequest` would also
 * accept an `Authorization` header, and that would be an escalation: a handoff
 * redeems into a long-lived *refresh* token, so accepting a short-lived access
 * token here would let a stolen one be upgraded into durable persistence. A
 * browser cookie is the only thing that should be able to start this flow.
 */

/**
 * Two minutes. The code is redeemed within a second of being issued — Chrome
 * hands the redirect straight to the service worker — so this is already
 * generous, and every extra second is a wider window for a leaked URL.
 */
const HANDOFF_TTL_SEC = 120;

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const block = await checkRateLimit(
      getHandoffCreateUserRatelimit(),
      `user:${user.id}`,
    );
    if (block) {
      return NextResponse.json(
        {
          error: "Too many requests. Try again later.",
          code: "RATE_LIMITED",
          retryAfter: block.retryAfterSec,
        },
        {
          status: 429,
          headers: { "Retry-After": String(block.retryAfterSec) },
        },
      );
    }

    const handoffId = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + HANDOFF_TTL_SEC * 1000).toISOString();

    // `extension_auth_handoffs` has RLS enabled with zero policies, so this
    // insert has to go through the service role. That is the design, not a
    // workaround: the row is written by one endpoint and consumed by another,
    // and no user-facing query should ever be able to read it.
    const service = createSupabaseServiceClient();
    const { error: insertError } = await service
      .from("extension_auth_handoffs")
      .insert({
        handoff_id: handoffId,
        user_id: user.id,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("extension handoff create:", insertError.message);
      return NextResponse.json(
        { error: "Could not create handoff" },
        { status: 500 },
      );
    }

    return NextResponse.json({ handoff_id: handoffId });
  } catch (e) {
    console.error("extension handoff create", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
