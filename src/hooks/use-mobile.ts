import * as React from "react";

// Tablets get the off-canvas Sheet, not the docked sidebar, so this sits at
// Tailwind's `lg`. Paired with `lg:` classes in sidebar.tsx and the dashboard
// layout — change all of them together or the trigger desyncs.
const MOBILE_BREAKPOINT = 1024;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * Whether the viewport is below the mobile breakpoint.
 *
 * useSyncExternalStore rather than useState + useEffect: the effect version has
 * to call setState synchronously on mount to catch the initial size, which
 * triggers a cascading render and paints one frame with the wrong layout. The
 * server snapshot returns false, so SSR renders the desktop layout.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  );
}
