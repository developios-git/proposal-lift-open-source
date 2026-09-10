import { createClient } from "@supabase/supabase-js";
import { mergeCors } from "@/lib/extension/cors";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

/**
 * Exchange a refresh token for a fresh session, on behalf of the extension.
 *
 * This route exists so the extension never has to know anything about Supabase.
 * The commercial extension calls `supabase.auth.refreshSession()` directly,
 * which forces a project URL and anon key to be baked in at build time — fine
 * when there is one server, impossible when every self-hoster has their own.
 * Moving the call here collapses the extension's world to a single origin: the
 * one the user typed.
 *
 * It uses the **publishable** key, so this authenticates without elevating —
 * a refresh token is already the bearer of its own authority, and nothing here
 * grants more than the token already carries.
 */

type Body = { refresh_token?: string };

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

    const refreshToken =
      typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
    if (!refreshToken) {
      return NextResponse.json(
        { error: "Missing refresh token" },
        {
          status: 400,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    // 401 specifically, because it is what tells the extension to drop the
    // stored session and show "Sign in" again. A 500 would leave it retrying a
    // token that is never going to work.
    if (error || !data.session) {
      return NextResponse.json(
        { error: "Invalid or expired refresh token" },
        {
          status: 401,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    const session = data.session;
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
    console.error("extension token refresh", e);
    return NextResponse.json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: mergeCors(request, { "Content-Type": "application/json" }),
      },
    );
  }
}
