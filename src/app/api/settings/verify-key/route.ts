import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyProviderKey } from "@/lib/ai/verify-key";
import { NextResponse, type NextRequest } from "next/server";

/**
 * POST /api/settings/verify-key
 *
 * Checks a key the user just typed, before it is saved. The key is used for the
 * probe and then discarded: it is never logged or echoed back.
 *
 * Shares `verifyProviderKey` with the save gate in `PUT /api/settings`, so the
 * button and the gate cannot disagree about what counts as invalid. It reports
 * the three-way result rather than a bare boolean, so "we could not reach the
 * provider" is not shown to the user as "your key is wrong".
 */
export async function POST(request: NextRequest) {
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
    const { provider, apiKey } = body;

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: "Provider and apiKey are required" },
        { status: 400 },
      );
    }

    if (provider !== "openai" && provider !== "anthropic") {
      return NextResponse.json(
        { error: 'Provider must be "openai" or "anthropic"' },
        { status: 400 },
      );
    }

    const result = await verifyProviderKey(provider, String(apiKey));

    // `valid` stays for the existing client branch; `status` and `message` let
    // it tell "rejected" apart from "could not check".
    return NextResponse.json({
      valid: result.status === "valid",
      status: result.status,
      ...(result.status === "valid" ? {} : { message: result.message }),
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
