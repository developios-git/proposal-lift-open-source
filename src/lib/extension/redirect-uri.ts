import {
  allowedExtensionIds,
  allowsAnyExtensionIdInDevelopment,
} from "@/lib/extension/extension-id";

/**
 * Validation for the `redirect_uri` the extension hands to `/extension/handoff`.
 *
 * **This is the security boundary of the whole extension sign-in flow.** The
 * handoff page mints a one-time code that is exchangeable for a live session,
 * then sends the browser to `redirect_uri` carrying it. Anything that widens
 * this check — a prefix test, a hostname suffix test, a regex with an unanchored
 * end — turns a link like
 *
 *   /extension/handoff?redirect_uri=https://evil.example/
 *
 * into "a signed-in user's browser mints a session for me and delivers it".
 *
 * So the test is string equality against a URL we construct ourselves. There is
 * no parsing, no normalisation, and no near-miss tolerance: a value that is not
 * character-for-character what Chrome will redirect to is not ours.
 */

/**
 * The sentinel Chrome watches for during `chrome.identity.launchWebAuthFlow`.
 *
 * Nothing is ever served from this host. When the auth window navigates here,
 * Chrome intercepts, closes the window, and hands the URL back to the
 * extension — which is what lets the flow work against a domain that appears
 * nowhere in the extension's manifest.
 */
export function extensionRedirectUri(extensionId: string): string {
  return `https://${extensionId}.chromiumapp.org/`;
}

/**
 * Shape of a Chrome-assigned extension id: 32 characters drawn from `a`-`p`.
 *
 * Only consulted by the development escape hatch, where the id of a freshly
 * loaded unpacked build is not knowable in advance. Never used in production —
 * there, an id must match one we were configured with.
 */
const DEV_REDIRECT_URI_PATTERN = /^https:\/\/[a-p]{32}\.chromiumapp\.org\/$/;

/** A type guard, so callers get a narrowed `string` rather than re-checking. */
export function isAllowedExtensionRedirectUri(
  raw: string | null | undefined,
): raw is string {
  if (typeof raw !== "string" || raw === "") return false;

  const ids = allowedExtensionIds();
  if (ids.length > 0) {
    return ids.some((id) => raw === extensionRedirectUri(id));
  }

  return allowsAnyExtensionIdInDevelopment() && DEV_REDIRECT_URI_PATTERN.test(raw);
}
