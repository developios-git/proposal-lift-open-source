/**
 * Which Chrome extension may talk to this server.
 *
 * The extension is distributed through the Chrome Web Store, so every install
 * carries the *same* id — the one in the README. It is configuration rather
 * than a shipped constant because a self-hoster should be able to set it the
 * way they set everything else: an entry in `.env`, or a variable in their
 * host's dashboard. Baking it into the source would mean editing a TypeScript
 * file and rebuilding to change a value that arrives by copy-paste.
 *
 * Both `extensionCorsHeaders` and `isAllowedExtensionRedirectUri` read this, so
 * the CORS allowlist and the OAuth redirect allowlist cannot drift apart. They
 * are two halves of one trust decision — which extension is ours — and a build
 * where they disagree is a build where one of them is wrong.
 */

/**
 * Extension ids allowed to reach this server.
 *
 * Normally the single store id from the README. An unpacked development build
 * gets a Chrome-generated id instead, so the same variable takes that one — it
 * is the same question either way, "which extension is ours". A comma-separated
 * list lets a development instance answer with more than one.
 */
export function allowedExtensionIds(): string[] {
  const configured = process.env.PUBLISHED_EXTENSION_ID?.trim();
  if (!configured) return [];
  return configured
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * The id the in-app Extension page builds its Web Store link from, or `""`
 * when nothing is configured and there is therefore nothing to link to.
 *
 * The first of the list: a second id only ever appears on a development
 * instance juggling unpacked builds, and no unpacked build has a store listing
 * to point at anyway.
 */
export function publishedExtensionId(): string {
  return allowedExtensionIds()[0] ?? "";
}

/**
 * Whether an unrecognised extension id may be accepted.
 *
 * True only in `next dev` with nothing configured, so that a freshly loaded
 * unpacked build — whose id Chrome generates at load time and which therefore
 * cannot be known in advance — can be exercised before `.env.local` is touched.
 *
 * `NODE_ENV` is `"production"` in every built artifact, so this cannot ship. It
 * is deliberately the *only* place the strict check is relaxed: both callers go
 * through it, so there is one escape hatch to audit rather than two.
 */
export function allowsAnyExtensionIdInDevelopment(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  if (allowedExtensionIds().length > 0) return false;
  console.warn(
    "[extension] PUBLISHED_EXTENSION_ID is not set — accepting any extension id. " +
      "Development only; set it in .env.local to test the real check.",
  );
  return true;
}
