"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { DEFAULT_FILTER_CRITERIA } from "@/types";

/** Creates a new saved filter with default criteria and navigates to it. Shared by every "Add filter" entry point. */
export function useCreateFilter() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const createFilter = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Untitled",
          filters: DEFAULT_FILTER_CRITERIA,
          auto_refresh_jobs_enabled: false,
        }),
      });
      const data = await res.json();
      if (res.ok && data.filter?.id) {
        router.push(`/filter/${data.filter.id}`);
        return;
      }
      toast.error(
        typeof data.error === "string" ? data.error : "Failed to create filter",
      );
    } catch {
      toast.error("Failed to create filter.");
    } finally {
      setCreating(false);
    }
  }, [creating, router]);

  return { createFilter, creating };
}
