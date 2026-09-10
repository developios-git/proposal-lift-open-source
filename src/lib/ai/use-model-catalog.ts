"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import type { ModelCatalog } from "@/lib/ai/model-catalog";

/**
 * The live model list for the settings screen, cached per browser session.
 *
 * **Why a TTL, when the qualify cache has none.** `qualify-cache-key.ts` expires
 * structurally: `QUALIFY_PROMPT_VERSION` is folded into the key, so old entries
 * become unreachable the moment our prompt changes. That works because the
 * thing that invalidates it lives in this repo. This cache goes stale when
 * *OpenAI ships a model* — nothing here changes, so no key derived from our own
 * code can expire it. Hence real elapsed time.
 *
 * Six hours, and no refresh button, which makes `refresh()` load-bearing: it is
 * the only path from "I just added my key" to "I can see my models". The
 * settings save and verify handlers must call it.
 */
const CACHE_KEY = "ai-model-catalog:v1";
const TTL_MS = 6 * 60 * 60 * 1000;

const EMPTY_CATALOG: ModelCatalog = {
  openai: { connected: false, models: [], error: null },
  anthropic: { connected: false, models: [], error: null },
};

type CacheEnvelope = { fetchedAt: number; data: ModelCatalog };

/**
 * Every access is wrapped: `sessionStorage` throws outright in some privacy
 * modes, not merely returns null, and a dropdown is not worth a crashed render.
 */
function readCache(): ModelCatalog | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as CacheEnvelope;
    if (Date.now() - envelope.fetchedAt > TTL_MS) return null;
    return envelope.data;
  } catch {
    return null;
  }
}

function writeCache(data: ModelCatalog): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: CacheEnvelope = { fetchedAt: Date.now(), data };
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(envelope));
  } catch {
    /* quota or private mode: the in-memory catalog still works */
  }
}

function clearCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* nothing to do; the refetch below is what actually matters */
  }
}

export type UseModelCatalog = {
  catalog: ModelCatalog;
  loading: boolean;
  /** Drops the cache and refetches. Call after any API key changes. */
  refresh: () => void;
};

/**
 * @param enabled gate the request on the AI Models tab being open, so the other
 *   settings tabs cost nothing.
 */
export function useModelCatalog(enabled: boolean): UseModelCatalog {
  const [catalog, setCatalog] = useState<ModelCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  const refresh = useCallback(() => {
    clearCache();
    setReloadCount((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const run = async () => {
      const cached = readCache();
      if (cached) {
        setCatalog(cached);
        return;
      }

      setLoading(true);
      try {
        const res = await apiFetch("/api/ai/models");
        if (cancelled || !res.ok) return;

        const data = (await res.json()) as ModelCatalog;
        if (cancelled) return;

        writeCache(data);
        setCatalog(data);
      } catch {
        // Leave the catalog empty. The settings page decides what to say from
        // `provider.isConnected`, which it knows independently of this request,
        // so a dropped call never claims the user has no key.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [enabled, reloadCount]);

  return { catalog, loading, refresh };
}
