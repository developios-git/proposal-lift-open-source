import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * DELETE /api/account
 *
 * Immediate, irreversible account deletion.
 *
 * Upstream this scheduled deletion 30 days out via `deletion_requested_at` /
 * `deletion_scheduled_for`, confined the account to /settings in the meantime,
 * and let a cron finish the job. Both columns and the cron are gone, so there is
 * nothing to schedule — the delete happens now.
 *
 * Every user-owned table references `auth.users(id) ON DELETE CASCADE` (verified
 * across all 15 foreign keys in the baseline migration), so removing the auth
 * user removes the profile, settings, filters, personas, projects, proposals,
 * templates, hooks and webhooks with it. Nothing is archived.
 *
 * Requires the caller to echo their own email, so a stray request cannot destroy
 * an account — the client asks the user to type it.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const confirmEmail =
      typeof body.confirmEmail === "string" ? body.confirmEmail.trim() : "";

    if (
      !user.email ||
      confirmEmail.toLowerCase() !== user.email.toLowerCase()
    ) {
      return NextResponse.json(
        {
          error:
            "Type your account email exactly to confirm deletion.",
          code: "confirm_email_mismatch",
        },
        { status: 400 },
      );
    }

    // auth.admin is not reachable from the caller's own session.
    const admin = createSupabaseServiceClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);

    if (error) {
      console.error("[account] delete failed:", error.message);
      return NextResponse.json(
        { error: "Could not delete the account. Please try again." },
        { status: 500 },
      );
    }

    // Best-effort: the user row is already gone, so a failure here only leaves a
    // dead cookie the next request discards.
    await supabase.auth.signOut().catch(() => {});

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[account] delete error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
