export type UpworkConnectionState = {
  /** `null` while the settings request is still in flight. */
  connected: boolean | null;
  /** The user's own Upwork OAuth app (Client ID + Secret) is configured. */
  oauthReady: boolean;
};

/**
 * Why an "Import from Upwork" action is unavailable, or null when it is fine.
 *
 * Mirrors the branching the filters page uses for its "Add filter" gate, so the
 * wording a user sees is consistent wherever a feature needs Upwork.
 *
 * Upstream had a third input, `sharedAvailable`, for paid accounts that could
 * borrow a platform-owned Upwork app. There is no shared app here, so
 * "no credentials" and "no route to connecting" are the same condition.
 *
 * @param what a verb phrase completing "... to {what}.", e.g. "import personas"
 */
export function upworkImportDisabledReason(
  state: UpworkConnectionState,
  what: string,
): string | null {
  if (state.connected === null) {
    return "Checking your Upwork connection...";
  }

  if (state.connected) {
    return null;
  }

  // Not connected. Telling someone with no credentials to "connect" is a dead
  // end — there is nothing to connect to until they register their own Upwork
  // app — so send them to Settings instead.
  if (!state.oauthReady) {
    return `Add your Upwork API credentials in Settings to ${what}.`;
  }

  return `Connect your Upwork account to ${what}.`;
}
