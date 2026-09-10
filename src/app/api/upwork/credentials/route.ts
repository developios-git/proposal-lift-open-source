import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { removeTenantUpworkCredentials } from "@/lib/upwork/remove-tenant-upwork-credentials";
import { NextResponse } from "next/server";

/**
 * DELETE /api/upwork/credentials
 *
 * Removes the user's Upwork app credentials and everything derived from them
 * (tokens and the cached vendor orgs).
 *
 * Upstream this existed as its own route because the billing and trial locks
 * matched on pathname, and a locked account had to keep a way out while
 * `PUT /api/settings` stayed blocked. There are no locks here, and the Settings
 * UI removes through `PUT /api/settings` — which spreads the same
 * `UPWORK_CREDENTIALS_REMOVAL_PAYLOAD`. It is kept as a stable, purely
 * destructive endpoint that cannot accidentally write anything else.
 *
 * The upstream owner/admin role check is gone: the only person who can reach
 * these rows is the person who owns them.
 */
export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await removeTenantUpworkCredentials(
      createSupabaseServiceClient(),
      { userId: user.id },
    );

    if (error) {
      console.error("Failed to remove Upwork credentials:", error);
      return NextResponse.json(
        { error: "Failed to remove Upwork credentials" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Upwork app credentials removed",
    });
  } catch (error) {
    console.error("Upwork credentials removal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
