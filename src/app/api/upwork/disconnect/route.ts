import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { clearTenantUpworkTokens } from "@/lib/upwork/tenant-upwork-settings";
import { NextResponse } from "next/server";

/**
 * POST /api/upwork/disconnect
 *
 * Clears the Upwork OAuth tokens but keeps the app credentials, so the user can
 * reconnect without re-entering their client id and secret. Use
 * `DELETE /api/upwork/credentials` to remove the app itself.
 */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error: updateError } = await clearTenantUpworkTokens(
      createSupabaseServiceClient(),
      { userId: user.id },
    );

    if (updateError) {
      console.error("Failed to disconnect Upwork:", updateError);
      return NextResponse.json(
        { error: "Failed to disconnect Upwork" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Upwork disconnected successfully",
    });
  } catch (error) {
    console.error("Upwork disconnect error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
