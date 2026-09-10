import { encryptUpworkClientSecret } from "@/lib/crypto/upwork-client-secret";
import { encryptAiApiKey } from "@/lib/crypto/ai-api-key";
import {
  resolveAnthropicApiKey,
  resolveOpenAIApiKey,
} from "@/lib/ai/keys";
import {
  describeUpworkOAuthConfig,
  getUpworkRedirectUriOptional,
} from "@/lib/upwork/resolve-oauth-credentials";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyProviderKey } from "@/lib/ai/verify-key";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
} from "@/lib/ai/model-catalog";
import { DEFAULT_AI_EFFORT, normalizeEffort } from "@/lib/ai/effort";
import type { AIProvider } from "@/lib/ai/ai-failure";
import { VENDOR_ORGS_CACHE_CLEAR_PAYLOAD } from "@/lib/upwork/vendor-orgs-cache";
import { UPWORK_CREDENTIALS_REMOVAL_PAYLOAD } from "@/lib/upwork/remove-tenant-upwork-credentials";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Upstream this route branched on org membership throughout: an
 * `organization_settings` row for members (with agency branding fields and an
 * owner/admin role check) and `user_settings` for everyone else, plus a billing
 * context, an access lock, and the whole shared-Upwork-access surface.
 *
 * Here there is one table and one owner.
 */

function maskApiKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return "****";
  return "****" + key.slice(-4);
}

function normalizeUpworkClientId(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  return s.length > 0 ? s : null;
}

const ALLOWED_FIELDS = [
  "openai_api_key",
  "openai_model",
  "openai_effort",
  "openai_max_tokens",
  "anthropic_api_key",
  "anthropic_model",
  "anthropic_effort",
  "anthropic_max_tokens",
  "fallback_model",
  "system_prompt",
  "upwork_search_terms",
  "knowledge_base",
  "job_feed_auto_refresh_enabled",
] as const;

/**
 * The two fields that hold a provider credential, and who to check them with.
 * Kept beside ALLOWED_FIELDS: a key added there without a row here would be
 * stored unverified, which is the exact failure this guard exists to stop.
 */
const API_KEY_FIELDS: { field: string; provider: AIProvider }[] = [
  { field: "openai_api_key", provider: "openai" },
  { field: "anthropic_api_key", provider: "anthropic" },
];

/**
 * Defaults for when the `user_settings` row does not exist yet.
 *
 * These are the value a user has when they have never chosen one — not a
 * catalog. The options the AI Models tab offers come from the providers
 * themselves, fetched with the user's own key, so there is no static list for a
 * default to be missing from any more.
 *
 * That used to be a real hazard: this comment previously required every id here
 * to appear in a hardcoded array in the settings page, enforced by nothing, and
 * upstream defaulted to `gpt-4o` / `gpt-4o-mini` — neither of which that array
 * offered. Importing the ids from `model-catalog` is what retires the rule.
 */
const SETTINGS_DEFAULTS: Record<string, unknown> = {
  openai_model: DEFAULT_OPENAI_MODEL,
  openai_effort: DEFAULT_AI_EFFORT,
  openai_max_tokens: 2000,
  anthropic_model: DEFAULT_ANTHROPIC_MODEL,
  anthropic_effort: DEFAULT_AI_EFFORT,
  anthropic_max_tokens: 2000,
  fallback_model: DEFAULT_OPENAI_MODEL,
  upwork_search_terms: "web development",
  job_feed_auto_refresh_enabled: false,
};

function jsonSettingsResponse(
  settings: Record<string, unknown>,
  /** Non-fatal notes about the write, e.g. a key that could not be checked. */
  warnings: string[] = [],
) {
  const oauthStatus = describeUpworkOAuthConfig({
    upwork_client_id: settings.upwork_client_id as string | null,
    upwork_client_secret_encrypted: settings.upwork_client_secret_encrypted as
      | string
      | null,
  });

  // Never let the ciphertext leave the server.
  const { upwork_client_secret_encrypted, ...rest } = settings;
  void upwork_client_secret_encrypted;

  return NextResponse.json({
    ...rest,
    // Keys are masked, not returned: the client only needs to know one is set.
    //
    // Resolved first, so the preview shows the last four characters of the key
    // itself rather than of its ciphertext. A key that will not decrypt resolves
    // to null and therefore reads as "not set" — which is the truth, and
    // surfaces the problem in Settings instead of at generation time.
    openai_api_key: maskApiKey(
      resolveOpenAIApiKey(settings.openai_api_key as string | null),
    ),
    anthropic_api_key: maskApiKey(
      resolveAnthropicApiKey(settings.anthropic_api_key as string | null),
    ),
    upwork_access_token: undefined,
    upwork_refresh_token: undefined,
    upwork_connected: !!settings.upwork_access_token,
    upwork_client_secret_configured: !!(
      settings.upwork_client_secret_encrypted as string | null | undefined
    )?.trim(),
    upwork_oauth_ready: oauthStatus.configured,
    upwork_oauth_message: oauthStatus.message,
    upwork_redirect_uri_hint: getUpworkRedirectUriOptional(),
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userSettings } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return jsonSettingsResponse({
      ...SETTINGS_DEFAULTS,
      ...(userSettings ?? {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    const updateData: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    // The copy above validates nothing, so an effort level arrives exactly as
    // sent. Normalising it here keeps an unusable value out of the column,
    // where it would surface as a failed generation rather than a failed save.
    // A `check` constraint backs this up in the schema.
    for (const field of ["openai_effort", "anthropic_effort"] as const) {
      if (field in updateData) {
        updateData[field] = normalizeEffort(updateData[field]);
      }
    }

    // Verify a key before storing it. The client only sends these fields when
    // the user actually changed them (it never PUTs the masked preview), so an
    // unchanged key costs no round trip.
    //
    // This is the gate, not the Verify button next to the field: that one is
    // advisory and opt-in, and a key that has never been proven to work is the
    // thing that turns every AI feature into an unexplained failure later.
    const keyWarnings: string[] = [];
    for (const { field, provider } of API_KEY_FIELDS) {
      const raw = updateData[field];

      // Removal. `null` and `""` both read as absent through
      // `resolveOpenAIApiKey`, but only one of them looks absent in the
      // database, so an empty string is normalised rather than stored.
      if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
        updateData[field] = null;
        continue;
      }

      // Absent from the body means untouched: nothing to probe.
      if (typeof raw !== "string") continue;

      const result = await verifyProviderKey(provider, raw);
      if (result.status === "invalid") {
        return NextResponse.json(
          { error: result.message, code: "invalid_api_key", provider },
          { status: 400 },
        );
      }
      if (result.status === "unknown") {
        keyWarnings.push(result.message);
      }

      // Verified as plaintext, stored as ciphertext. Encryption goes after the
      // probe so the probe still sees a real key, and after the invalid check so
      // a rejected key is never written in any form.
      try {
        updateData[field] = encryptAiApiKey(raw.trim());
      } catch {
        return NextResponse.json(
          {
            error:
              "This server cannot store API keys securely: AI_KEYS_ENCRYPTION_KEY is missing or invalid. Set it (openssl rand -hex 32) and restart.",
            code: "encryption_unavailable",
          },
          { status: 500 },
        );
      }
    }

    const touchesOAuthCredentials =
      "upwork_client_id" in body || "upwork_client_secret" in body;

    let clearUpworkTokens = false;
    let removedCredentials = false;

    if (touchesOAuthCredentials) {
      const { data: current } = await supabase
        .from("user_settings")
        .select("upwork_client_id, upwork_client_secret_encrypted")
        .eq("user_id", user.id)
        .maybeSingle();

      const oauthResult = applyOAuthBodyToUpdate(
        body,
        current ?? {
          upwork_client_id: null,
          upwork_client_secret_encrypted: null,
        },
        updateData,
      );
      if (oauthResult instanceof NextResponse) return oauthResult;
      clearUpworkTokens = oauthResult.clearUpworkTokens;
      removedCredentials = oauthResult.removedCredentials;
    }

    if (clearUpworkTokens) {
      if (removedCredentials) {
        // Full exit. Shares the one payload with DELETE /api/upwork/credentials
        // so the two removal paths cannot disagree about what removal means.
        Object.assign(updateData, UPWORK_CREDENTIALS_REMOVAL_PAYLOAD);
      } else {
        // Rotation: the same Upwork account will reconnect against the new app,
        // so the credentials just written stay.
        updateData.upwork_access_token = null;
        updateData.upwork_refresh_token = null;
        updateData.upwork_token_expires_at = null;
        updateData.upwork_connected_at = null;
        // The cached vendor orgs describe the connection being dropped here, so
        // they die with it — same rule the disconnect and callback paths follow.
        Object.assign(updateData, VENDOR_ORGS_CACHE_CLEAR_PAYLOAD);
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    updateData.updated_at = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, ...updateData } as never, {
        onConflict: "user_id",
      })
      .select("*")
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: "Failed to update settings" },
        { status: 500 },
      );
    }

    return jsonSettingsResponse(
      { ...SETTINGS_DEFAULTS, ...updated },
      keyWarnings,
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * Validates the Upwork credential half of the body and folds it into
 * `updateData`. Pure apart from encryption, so the rules stay in one place.
 *
 * Returns a NextResponse to reject, or the two flags the caller needs to decide
 * what else must be cleared.
 */
function applyOAuthBodyToUpdate(
  body: Record<string, unknown>,
  current: {
    upwork_client_id: string | null;
    upwork_client_secret_encrypted: string | null;
  },
  updateData: Record<string, unknown>,
): NextResponse | { clearUpworkTokens: boolean; removedCredentials: boolean } {
  const prevId = normalizeUpworkClientId(current.upwork_client_id);
  const hadSecret = !!current.upwork_client_secret_encrypted?.trim();

  let clearUpworkTokens = false;
  /**
   * True only for an outright removal (`upwork_client_id: null`), never for a
   * rotation. The caller uses it to decide what survives: a rotation keeps the
   * connected account's identity, a removal wipes it.
   */
  let removedCredentials = false;

  if (
    "upwork_client_id" in body &&
    normalizeUpworkClientId(body.upwork_client_id) === null
  ) {
    updateData.upwork_client_id = null;
    updateData.upwork_client_secret_encrypted = null;
    updateData.upwork_oauth_credentials_updated_at = null;
    clearUpworkTokens = true;
    removedCredentials = true;
  } else {
    const nextId =
      "upwork_client_id" in body
        ? normalizeUpworkClientId(body.upwork_client_id)
        : prevId;

    const secretProvided = "upwork_client_secret" in body;
    const rawSecret =
      typeof body.upwork_client_secret === "string"
        ? body.upwork_client_secret
        : "";

    if (secretProvided && rawSecret.trim().length > 0 && !nextId) {
      return NextResponse.json(
        { error: "Provide Upwork Client ID together with the Client Secret." },
        { status: 400 },
      );
    }

    if (nextId && (nextId.length < 4 || nextId.length > 256)) {
      return NextResponse.json(
        { error: "Upwork Client ID must be between 4 and 256 characters." },
        { status: 400 },
      );
    }

    const idChanged = nextId !== prevId;

    if (
      nextId &&
      !hadSecret &&
      (!secretProvided || rawSecret.trim().length < 8)
    ) {
      return NextResponse.json(
        {
          error:
            "Upwork Client Secret is required when saving your Upwork app credentials.",
        },
        { status: 400 },
      );
    }

    if (idChanged && nextId && (!secretProvided || rawSecret.trim().length < 8)) {
      return NextResponse.json(
        {
          error:
            "When changing the Upwork Client ID, provide the matching Client Secret.",
        },
        { status: 400 },
      );
    }

    if ("upwork_client_id" in body) {
      updateData.upwork_client_id = nextId;
    }

    if (secretProvided && rawSecret.trim().length > 0) {
      if (rawSecret.trim().length < 8) {
        return NextResponse.json(
          { error: "Upwork Client Secret must be at least 8 characters." },
          { status: 400 },
        );
      }
      try {
        updateData.upwork_client_secret_encrypted = encryptUpworkClientSecret(
          rawSecret.trim(),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Encryption failed";
        return NextResponse.json(
          {
            error: `Cannot store Upwork secret: ${msg}. Set UPWORK_CREDENTIALS_ENCRYPTION_KEY (64 hex chars).`,
          },
          { status: 500 },
        );
      }
      updateData.upwork_oauth_credentials_updated_at = new Date().toISOString();
      clearUpworkTokens = true;
    } else if (idChanged && nextId) {
      clearUpworkTokens = true;
    }
  }

  return { clearUpworkTokens, removedCredentials };
}
