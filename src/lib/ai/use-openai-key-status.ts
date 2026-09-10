"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";

export type OpenAIKeyStatus = "checking" | "present" | "missing";

/**
 * Whether the signed-in user has saved an OpenAI key.
 *
 * `/api/settings` returns the key masked (`"****abcd"`) or null, so this asks
 * only the question the UI needs and never handles the key itself.
 *
 * Used to gate the surfaces that cannot work without one, so the user is told
 * before filling in a form rather than after submitting it. The API routes
 * enforce the same rule themselves; this is the courtesy, not the control.
 *
 * A failed request resolves to `present`. The server rejects the write anyway
 * with a message naming the missing step, so guessing "missing" here would only
 * lock someone out of their own portfolio over a dropped request.
 */
export function useOpenAIKeyStatus(): OpenAIKeyStatus {
  const [status, setStatus] = useState<OpenAIKeyStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await apiFetch("/api/settings");
        if (cancelled) return;
        if (!res.ok) {
          setStatus("present");
          return;
        }
        const data = (await res.json()) as { openai_api_key?: string | null };
        if (!cancelled) {
          setStatus(data.openai_api_key ? "present" : "missing");
        }
      } catch {
        if (!cancelled) setStatus("present");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
