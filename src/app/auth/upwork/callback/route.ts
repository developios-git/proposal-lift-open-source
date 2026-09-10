import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/upwork/client";
import {
  resolveUpworkOAuthCredentials,
  UpworkOAuthCredentialsError,
} from "@/lib/upwork/resolve-oauth-credentials";
import { VENDOR_ORGS_CACHE_CLEAR_PAYLOAD } from "@/lib/upwork/vendor-orgs-cache";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Upwork OAuth2 callback.
 *
 * State format: `nonce:solo:userId` (see POST /api/upwork/connect). Upstream
 * handled four shapes — agency, solo, and a shared-app variant of each — and
 * exchanged shared-mode codes against a platform-owned Upwork app. There is one
 * shape and one app here.
 *
 * Upstream also called `fetchUpworkUserIdentity` to store the connected
 * profile's ciphertext. `user_settings.upwork_ciphertext` does not exist in this
 * schema and only the removed admin panel ever read it, so that extra Upwork API
 * call is gone with it.
 */
function settingsError(request: NextRequest, message: string) {
  return NextResponse.redirect(
    new URL(
      `/settings?upwork=error&message=${encodeURIComponent(message)}`,
      request.url,
    ),
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    const errorDescription =
      searchParams.get("error_description") || "Authorization denied";
    console.error("Upwork OAuth error:", errorParam, errorDescription);
    return settingsError(request, errorDescription);
  }

  if (!code || !state) {
    return settingsError(request, "Missing authorization code or state");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.redirect(
        new URL("/login?redirect=/settings", request.url),
      );
    }

    const stateParts = state.split(":");
    const stateUserId =
      stateParts.length >= 3 && stateParts[1] === "solo"
        ? stateParts.slice(2).join(":")
        : null;

    // The state must name the user completing the exchange. Without this, a
    // state minted for one account could be redeemed while signed in as another.
    if (!stateUserId || stateUserId !== user.id) {
      return settingsError(request, "Invalid state parameter");
    }

    const serviceClient = createSupabaseServiceClient();

    const { data: oauthRow, error: oauthRowError } = await serviceClient
      .from("user_settings")
      .select("upwork_client_id, upwork_client_secret_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();

    if (oauthRowError || !oauthRow) {
      return settingsError(request, "User settings not found");
    }

    let oauth: ReturnType<typeof resolveUpworkOAuthCredentials>;
    try {
      oauth = resolveUpworkOAuthCredentials(oauthRow);
    } catch (e) {
      return settingsError(
        request,
        e instanceof UpworkOAuthCredentialsError
          ? e.message
          : "Upwork OAuth is not configured",
      );
    }

    const tokens = await exchangeCodeForTokens(code, {
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      redirectUri: oauth.redirectUri,
    });

    const { error: updateError } = await serviceClient.from("user_settings").upsert(
      {
        user_id: user.id,
        upwork_access_token: tokens.access_token,
        upwork_refresh_token: tokens.refresh_token,
        upwork_token_expires_at:
          tokens.expires_at ||
          new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        upwork_connected_at: new Date().toISOString(),
        // A reconnect can be a different Upwork account, so the previous
        // account's cached vendor orgs must not survive it.
        ...VENDOR_ORGS_CACHE_CLEAR_PAYLOAD,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (updateError) {
      console.error("Failed to store Upwork tokens:", updateError);
      return settingsError(request, "Failed to save tokens");
    }

    return NextResponse.redirect(
      new URL("/settings?upwork=connected", request.url),
    );
  } catch (error) {
    console.error("Upwork OAuth callback error:", error);
    return settingsError(
      request,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
