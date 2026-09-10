"use client";

import { useEffect } from "react";

const PING_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

async function ping() {
  try {
    await fetch("/api/presence/ping", { method: "POST" });
  } catch {
    // Silently ignore — network errors should not surface to the user.
  }
}

/**
 * Keeps the user_presence row up to date while the dashboard is open.
 *
 * - Fires immediately on mount.
 * - Repeats every 2 minutes while the tab is visible.
 * - Fires again when the tab becomes visible after being hidden (e.g. user
 *   switches back to the tab).
 *
 * The cron job reads user_presence to decide whether a webhook should be sent:
 * if last_seen_at is within the last 5 minutes the user is considered online
 * and the webhook is skipped (the browser alert handles it instead).
 */
export function usePresencePing() {
  useEffect(() => {
    // Immediate ping on mount (tab is visible by definition at this point).
    ping();

    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") {
        ping();
      }
    }, PING_INTERVAL_MS);

    // Re-ping when the user switches back to this tab.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        ping();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}
