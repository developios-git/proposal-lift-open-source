import { decryptUpworkClientSecret } from "@/lib/crypto/upwork-client-secret";
import { refreshUpworkTokens } from "@/lib/upwork/client";
import type { UpworkTokens } from "@/lib/upwork/client";
import type { Database } from "@/types/database";

type SettingsRow = Database["public"]["Tables"]["user_settings"]["Row"];

/** The credential pair columns, on whichever row shape the caller has. */
export type UpworkCredentialColumns = Pick<
  SettingsRow,
  "upwork_client_id" | "upwork_client_secret_encrypted"
>;

export type ResolvedUpworkOAuthCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export class UpworkOAuthCredentialsError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "missing_redirect_uri"
      | "missing_tenant_credentials"
      | "incomplete_tenant_credentials"
      | "decrypt_failed",
  ) {
    super(message);
    this.name = "UpworkOAuthCredentialsError";
  }
}

function trimOrNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t.length ? t : null;
}

/**
 * Canonical redirect URI — must match the Upwork app registration of whoever is
 * running this instance.
 */
export function getUpworkRedirectUri(): string {
  const u = process.env.UPWORK_REDIRECT_URI?.trim();
  if (!u) {
    throw new UpworkOAuthCredentialsError(
      "UPWORK_REDIRECT_URI is not configured",
      "missing_redirect_uri",
    );
  }
  return u;
}

/** Same as configured redirect, without throwing (for Settings UI hints). */
export function getUpworkRedirectUriOptional(): string | null {
  const u = process.env.UPWORK_REDIRECT_URI?.trim();
  return u && u.length > 0 ? u : null;
}

/**
 * Resolve OAuth client id + secret + redirect from the user's own settings.
 *
 * There is no platform-level fallback: no `UPWORK_CLIENT_ID` /
 * `UPWORK_CLIENT_SECRET` env pair, and no shared app. Everyone registers their
 * own Upwork developer app.
 */
export function resolveUpworkOAuthCredentials(
  settings: UpworkCredentialColumns,
): ResolvedUpworkOAuthCredentials {
  const redirectUri = getUpworkRedirectUri();

  const clientId = trimOrNull(settings.upwork_client_id);
  const enc = trimOrNull(settings.upwork_client_secret_encrypted);

  if (Boolean(clientId) !== Boolean(enc)) {
    throw new UpworkOAuthCredentialsError(
      "Enter both Upwork Client ID and Client Secret, or clear both fields.",
      "incomplete_tenant_credentials",
    );
  }

  if (!clientId || !enc) {
    throw new UpworkOAuthCredentialsError(
      "Add your Upwork OAuth Client ID and Client Secret under Settings → Integrations.",
      "missing_tenant_credentials",
    );
  }

  try {
    return {
      clientId,
      clientSecret: decryptUpworkClientSecret(enc),
      redirectUri,
    };
  } catch {
    throw new UpworkOAuthCredentialsError(
      "Stored Upwork client secret could not be decrypted. Check UPWORK_CREDENTIALS_ENCRYPTION_KEY or save credentials again.",
      "decrypt_failed",
    );
  }
}

/**
 * Refresh tokens using the app that issued them.
 *
 * Upstream had two functions here: one for the tenant's own app, and
 * `refreshUpworkTokensForRow`, which branched on `upwork_token_source` to
 * refresh shared-mode tokens against the platform app instead. With one issuing
 * app there is only one path, so the two collapse into this.
 */
export async function refreshUpworkTokensForRow(
  settings: UpworkCredentialColumns,
  refreshToken: string,
): Promise<UpworkTokens> {
  const oauth = resolveUpworkOAuthCredentials(settings);
  return refreshUpworkTokens(refreshToken, {
    clientId: oauth.clientId,
    clientSecret: oauth.clientSecret,
  });
}

/** For the Settings UI: OAuth is ready only when stored credentials resolve. */
export function describeUpworkOAuthConfig(settings: UpworkCredentialColumns): {
  configured: boolean;
  message?: string;
} {
  try {
    resolveUpworkOAuthCredentials(settings);
    return { configured: true };
  } catch (e) {
    const message =
      e instanceof UpworkOAuthCredentialsError ? e.message : String(e);
    return { configured: false, message };
  }
}
