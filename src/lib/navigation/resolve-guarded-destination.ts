/**
 * Decides whether a link click should be held back by an unsaved-changes guard.
 *
 * The App Router has no route-change guard hook, so the only way to stop an
 * in-app navigation before it happens is to intercept the click. That makes the
 * decision easy to get subtly wrong, so it lives here as a pure function rather
 * than inline in an effect.
 *
 * Anything this returns null for is deliberately left alone: either it is not a
 * navigation at all, or it leaves the origin entirely and the browser's own
 * beforeunload prompt is the right mechanism.
 */
export interface AnchorNavigationContext {
  /** Absolute href. `HTMLAnchorElement.href` is always resolved to absolute. */
  href: string | null | undefined;
  /** The anchor's `target`, if any. */
  target?: string | null;
  /** True when the anchor carries a `download` attribute. */
  hasDownload?: boolean;
  /** True for ctrl/meta/shift/alt clicks, which do not navigate in place. */
  modifierKey?: boolean;
  /** `MouseEvent.button`. Only a primary click navigates the current tab. */
  button?: number;
  /** `window.location.origin`. */
  origin: string;
  /** `window.location.pathname + window.location.search`. */
  currentPathWithSearch: string;
}

/**
 * Returns the in-app destination (path + search + hash) the click would go to
 * when it should be guarded, or null when the click must be left untouched.
 */
export function resolveGuardedDestination(
  ctx: AnchorNavigationContext,
): string | null {
  const {
    href,
    target,
    hasDownload = false,
    modifierKey = false,
    button = 0,
    origin,
    currentPathWithSearch,
  } = ctx;

  if (!href) return null;
  // Middle/right click, or a modified click: opens a new tab or context menu,
  // so the current page keeps its unsaved state either way.
  if (button !== 0 || modifierKey) return null;
  if (hasDownload) return null;
  if (target && target !== "_self") return null;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  // mailto:, tel:, blob: and friends never replace the current document.
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // Leaving the origin fires beforeunload, which is the better prompt there.
  if (url.origin !== origin) return null;

  const destination = `${url.pathname}${url.search}`;
  // Same page, or a pure in-page anchor jump: nothing is lost.
  if (destination === currentPathWithSearch) return null;

  return `${destination}${url.hash}`;
}
