"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import type { UpworkConnectionState } from "@/lib/upwork/upwork-import-disabled-reason";

/**
 * Reads the user's Upwork connection state from `/api/settings`.
 *
 * `connected` stays `null` until the request resolves, so callers can show a
 * "checking" state rather than briefly claiming the account is disconnected and
 * flickering a disabled button on every page load.
 *
 * A failed request also leaves `connected` at `null`, which keeps dependent
 * actions disabled. That is deliberate: enabling an import that is certain to
 * fail at the API is worse than making the user retry.
 */
export function useUpworkConnection(): UpworkConnectionState {
  const [state, setState] = useState<UpworkConnectionState>({
    connected: null,
    oauthReady: false,
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await apiFetch("/api/settings");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          upwork_connected?: boolean;
          upwork_oauth_ready?: boolean;
        };
        if (cancelled) return;
        setState({
          connected: !!data.upwork_connected,
          oauthReady: !!data.upwork_oauth_ready,
        });
      } catch {
        // Leave `connected` null so the caller keeps the action disabled.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
