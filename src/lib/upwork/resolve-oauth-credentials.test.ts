import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the network + crypto boundaries so the OAuth app selection can be
// asserted without real HTTP or decryption. `vi.hoisted` keeps the mock fn
// available inside the hoisted vi.mock factory.
const { refreshUpworkTokens } = vi.hoisted(() => ({
  refreshUpworkTokens: vi.fn(async () => ({
    access_token: "new-access",
    refresh_token: "new-refresh",
    token_type: "Bearer",
    expires_in: 3600,
    expires_at: null,
  })),
}));

vi.mock("@/lib/upwork/client", () => ({
  refreshUpworkTokens,
}));

vi.mock("@/lib/crypto/upwork-client-secret", () => ({
  decryptUpworkClientSecret: (enc: string) => {
    if (enc === "corrupt") throw new Error("bad ciphertext");
    return `decrypted:${enc}`;
  },
}));

import {
  refreshUpworkTokensForRow,
  resolveUpworkOAuthCredentials,
  describeUpworkOAuthConfig,
  UpworkOAuthCredentialsError,
} from "./resolve-oauth-credentials";

const REDIRECT = "https://app.example.com/auth/upwork/callback";

describe("resolve-oauth-credentials", () => {
  let savedRedirect: string | undefined;

  beforeEach(() => {
    refreshUpworkTokens.mockClear();
    savedRedirect = process.env.UPWORK_REDIRECT_URI;
    process.env.UPWORK_REDIRECT_URI = REDIRECT;
  });

  afterEach(() => {
    if (savedRedirect === undefined) delete process.env.UPWORK_REDIRECT_URI;
    else process.env.UPWORK_REDIRECT_URI = savedRedirect;
  });

  it("refreshes against the user's own Upwork app, decrypting the secret", async () => {
    await refreshUpworkTokensForRow(
      {
        upwork_client_id: "user-id",
        upwork_client_secret_encrypted: "user-enc",
      },
      "the-refresh-token",
    );

    expect(refreshUpworkTokens).toHaveBeenCalledTimes(1);
    expect(refreshUpworkTokens).toHaveBeenCalledWith("the-refresh-token", {
      clientId: "user-id",
      clientSecret: "decrypted:user-enc",
    });
  });

  it("resolves a complete credential pair", () => {
    expect(
      resolveUpworkOAuthCredentials({
        upwork_client_id: "user-id",
        upwork_client_secret_encrypted: "user-enc",
      }),
    ).toEqual({
      clientId: "user-id",
      clientSecret: "decrypted:user-enc",
      redirectUri: REDIRECT,
    });
  });

  it("rejects a half-filled pair rather than silently ignoring one field", () => {
    expect(() =>
      resolveUpworkOAuthCredentials({
        upwork_client_id: "user-id",
        upwork_client_secret_encrypted: null,
      }),
    ).toThrow(UpworkOAuthCredentialsError);

    try {
      resolveUpworkOAuthCredentials({
        upwork_client_id: null,
        upwork_client_secret_encrypted: "user-enc",
      });
    } catch (e) {
      expect((e as UpworkOAuthCredentialsError).code).toBe(
        "incomplete_tenant_credentials",
      );
    }
  });

  it("treats whitespace-only credentials as absent", () => {
    try {
      resolveUpworkOAuthCredentials({
        upwork_client_id: "   ",
        upwork_client_secret_encrypted: "   ",
      });
    } catch (e) {
      expect((e as UpworkOAuthCredentialsError).code).toBe(
        "missing_tenant_credentials",
      );
    }
  });

  it("reports a decrypt failure distinctly from a missing key", () => {
    try {
      resolveUpworkOAuthCredentials({
        upwork_client_id: "user-id",
        upwork_client_secret_encrypted: "corrupt",
      });
    } catch (e) {
      expect((e as UpworkOAuthCredentialsError).code).toBe("decrypt_failed");
    }
  });

  it("fails when the redirect URI is not configured", () => {
    delete process.env.UPWORK_REDIRECT_URI;
    try {
      resolveUpworkOAuthCredentials({
        upwork_client_id: "user-id",
        upwork_client_secret_encrypted: "user-enc",
      });
    } catch (e) {
      expect((e as UpworkOAuthCredentialsError).code).toBe(
        "missing_redirect_uri",
      );
    }
  });

  it("describes config state for the Settings UI without throwing", () => {
    expect(
      describeUpworkOAuthConfig({
        upwork_client_id: "user-id",
        upwork_client_secret_encrypted: "user-enc",
      }),
    ).toEqual({ configured: true });

    const missing = describeUpworkOAuthConfig({
      upwork_client_id: null,
      upwork_client_secret_encrypted: null,
    });
    expect(missing.configured).toBe(false);
    expect(missing.message).toContain("Settings");
  });
});
