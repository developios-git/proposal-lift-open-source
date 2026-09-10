import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { getUpworkAuthUrl } from "@/lib/upwork/client";
import {
  resolveUpworkOAuthCredentials,
  UpworkOAuthCredentialsError,
} from "@/lib/upwork/resolve-oauth-credentials";
import { NextResponse } from "next/server";

/**
 * POST /api/upwork/connect
 *
 * Generates the Upwork OAuth2 authorization URL for the signed-in user's own
 * Upwork app.
 *
 * Upstream this also accepted `{ shared: true }` to authenticate against a
 * platform-owned Upwork app, gated on a paid plan and the absence of personal
 * credentials, and encoded four different `state` shapes to tell the callback
 * which combination it was handling. There is one shape here.
 *
 * State: `nonce:solo:userId`. The `solo` segment is kept so the value stays
 * unambiguous if the format ever grows again, and so a state minted by an older
 * deploy still parses.
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

    // Service client: the credential columns are needed to build the auth URL,
    // and this reads the caller's own row only.
    const { data: userSettings } = await createSupabaseServiceClient()
      .from("user_settings")
      .select("upwork_client_id, upwork_client_secret_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!userSettings) {
      return NextResponse.json(
        {
          error:
            "Save your Upwork Client ID and Client Secret in Settings first, then try again.",
        },
        { status: 400 },
      );
    }

    let oauth: ReturnType<typeof resolveUpworkOAuthCredentials>;
    try {
      oauth = resolveUpworkOAuthCredentials(userSettings);
    } catch (e) {
      const message =
        e instanceof UpworkOAuthCredentialsError
          ? e.message
          : "Upwork OAuth is not configured. Add your Client ID and Secret in Settings.";
      return NextResponse.json({ error: message }, { status: 422 });
    }

    const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const state = `${nonce}:solo:${user.id}`;

    return NextResponse.json({
      url: getUpworkAuthUrl(state, {
        clientId: oauth.clientId,
        redirectUri: oauth.redirectUri,
      }),
    });
  } catch (error) {
    console.error("Upwork connect error:", error);
    return NextResponse.json(
      { error: "Failed to generate Upwork authorization URL" },
      { status: 500 },
    );
  }
}
