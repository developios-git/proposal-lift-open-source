import { mergeCors } from "@/lib/extension/cors";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Exchange a one-time handoff code for a session. Called by the extension's
 * service worker, never by a browser page.
 *
 * **Deliberately unauthenticated.** The handoff id *is* the credential — the
 * extension has nothing else at this point, which is the whole reason the flow
 * exists. Three things carry the weight that authentication normally would:
 *
 *  1. The id is 64 random hex characters, issued only to a cookie-authenticated
 *     browser session by `handoff/create`.
 *  2. It lives for 120 seconds.
 *  3. Consumption is a single atomic UPDATE. The `WHERE consumed_at IS NULL AND
 *     expires_at > now()` **is** the lock — a read-then-write would let two
 *     concurrent redeems both pass the check and both mint a session.
 *
 * `/api/extension/handoff/redeem` is already IP-rate-limited in
 * `src/lib/rate-limit/middleware-rate-limit.ts` before this handler runs, so
 * there is no per-IP limit here.
 */

type Body = { handoff_id?: string };

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: mergeCors(request, {}),
  });
}

export async function POST(request: NextRequest) {
  try {
    let body: Body = {};
    try {
      body = (await request.json()) as Body;
    } catch {
      body = {};
    }

    const handoffId =
      typeof body.handoff_id === "string" ? body.handoff_id.trim() : "";
    if (!handoffId || handoffId.length < 32) {
      return NextResponse.json(
        { error: "Invalid handoff" },
        {
          status: 400,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    const service = createSupabaseServiceClient();
    const nowIso = new Date().toISOString();

    const { data: consumed, error: consumeErr } = await service
      .from("extension_auth_handoffs")
      .update({ consumed_at: nowIso })
      .eq("handoff_id", handoffId)
      .is("consumed_at", null)
      .gt("expires_at", nowIso)
      .select("user_id")
      .maybeSingle();

    if (consumeErr || !consumed?.user_id) {
      // Expired, already used, or never existed. All three are the same answer
      // to the caller: ask the user to sign in again.
      console.warn("extension handoff redeem: invalid or expired");
      return NextResponse.json(
        { error: "Invalid or expired handoff" },
        {
          status: 400,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    const { data: userRes, error: getUserErr } =
      await service.auth.admin.getUserById(consumed.user_id);
    if (getUserErr || !userRes.user?.email) {
      console.error("extension handoff redeem: user", getUserErr?.message);
      return NextResponse.json(
        { error: "User not found" },
        {
          status: 400,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    // Mint a real session without a password. `generateLink` does not send an
    // email — it returns the token hash, which `verifyOtp` immediately spends.
    // This is why extension sign-in requires SUPABASE_SECRET_KEY: both calls
    // are admin-only.
    const { data: linkData, error: linkErr } =
      await service.auth.admin.generateLink({
        type: "magiclink",
        email: userRes.user.email,
      });

    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error("extension handoff redeem: generateLink", linkErr?.message);
      return NextResponse.json(
        { error: "Could not mint session" },
        {
          status: 500,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    const { data: sessionData, error: verifyErr } = await service.auth.verifyOtp(
      { type: "magiclink", token_hash: linkData.properties.hashed_token },
    );

    if (verifyErr || !sessionData?.session) {
      console.error("extension handoff redeem: verifyOtp", verifyErr?.message);
      return NextResponse.json(
        { error: "Could not verify session" },
        {
          status: 500,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    const session = sessionData.session;
    return NextResponse.json(
      {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        token_type: session.token_type,
        user: session.user,
      },
      { headers: mergeCors(request, { "Content-Type": "application/json" }) },
    );
  } catch (e) {
    console.error("extension handoff redeem", e);
    return NextResponse.json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: mergeCors(request, { "Content-Type": "application/json" }),
      },
    );
  }
}
