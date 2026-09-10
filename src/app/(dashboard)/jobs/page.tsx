"use client";

import { apiFetch } from "@/lib/api-fetch";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Sparkles,
  Loader2,
  ExternalLink,
  Clock,
  MapPin,
  ShieldCheck,
  ChevronDown,
  Eye,
  Send,
  AlertTriangle,
  RefreshCw,
  Zap,
  Bell,
  Copy,
  Check,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { postedAtMsForSort } from "@/lib/jobs/posted-at-ms";
import { isSavedFilterFeedEligible } from "@/lib/jobs/saved-filter-feed-eligible";
import { redirectToUpworkOAuth } from "@/lib/upwork/start-oauth";
import { UpworkAccessBanner } from "@/components/upwork/UpworkAccessBanner";
import { useJobAlerts } from "@/lib/job-alerts/useJobAlerts";
import { useNewJobHighlight } from "@/lib/jobs/use-new-job-highlight";
import {
  getCompetitionLevel,
  getCompetitionTooltip,
  type CompetitionLevel,
} from "@/lib/jobs/competition-level";
import { storeJobPrefill } from "@/lib/prefill";
import { jobBudgetPrefill } from "@/lib/jobs/job-budget-prefill";
import { cn } from "@/lib/utils";
import {
  ClientRankBadge,
  ClientRankPopover,
} from "@/components/ClientRankPopover";
import { computeClientRankScore } from "@/lib/client-rank";

function buildUpworkJobUrl(title: string, storedUrl: string): string {
  const match = storedUrl.match(/\/jobs\/([^/?]+)/);
  const segment = match?.[1] ?? "";
  if (segment.startsWith("~")) {
    return storedUrl;
  }
  const slug = title.replace(/[ /]/g, "-");
  return `https://www.upwork.com/jobs/${slug}_${segment}/?referrer_url_path=/nx/search/jobs/`;
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

/**
 * Competition badge colours for the Jobs cards. Theme-aware tokens here; the
 * filter feed uses its own fixed light palette. Thresholds are shared via
 * lib/jobs/competition-level.
 */
/**
 * Client rank pill colours. Solid fills matching the filter feed's badge, so the
 * same score reads identically on both pages; they hold up on light and dark.
 */
const CLIENT_RANK_BADGE_CLASS: Record<1 | 3 | 5, string> = {
  5: "bg-[#4CAF50] text-white",
  3: "bg-[#FF9800] text-white",
  1: "bg-[#F44336] text-white",
};

/** Shown when too few signals resolved to grade the client. See client-rank.ts. */
const CLIENT_RANK_UNKNOWN_BADGE_CLASS =
  "bg-muted text-muted-foreground border border-border";

const COMPETITION_BADGE_CLASS: Record<CompetitionLevel, string> = {
  low: "bg-green-500/10 text-green-600 dark:text-green-400",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  high: "bg-red-500/10 text-red-600 dark:text-red-400",
};

interface Job {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  category: string | null;
  skills: string[];
  experience_level: string | null;
  job_type: string | null;
  budget_min: number | null;
  budget_max: number | null;
  hourly_rate_min: number | null;
  hourly_rate_max: number | null;
  duration: string | null;
  client_country: string | null;
  client_city: string | null;
  client_total_spent: number | null;
  client_hire_rate: number | null;
  client_total_hires: number | null;
  client_total_posted_jobs: number | null;
  client_total_reviews: number | null;
  client_payment_verified: boolean;
  client_avg_rating: number | null;
  client_member_since: string | null;
  client_last_contract_title: string | null;
  renewed_at: string | null;
  proposals_count: number | null;
  posted_at: string | null;
  connects_required: number | null;
  fit_score: number | null;
  fit_reasons: string[] | null;
  ai_summary: string | null;
  status: string;
  notes: string | null;
  /** Upwork reports the connected account already submitted a proposal here. */
  already_applied?: boolean;
}

/** Jobs per page for the Upwork feed (initial load and each "Load more"). */
const FEED_PAGE_SIZE = 25;

/** Manual refresh only: minimum seconds between user-triggered feed refetches. */
const MANUAL_REFRESH_COOLDOWN_MS = 15_000;

/** Newest post time first (descending by `posted_at`). Jobs without a date sort last. */
function sortJobsByPostedAtNewestFirst(jobs: Job[]): Job[] {
  return [...jobs].sort(
    (a, b) => postedAtMsForSort(b.posted_at) - postedAtMsForSort(a.posted_at),
  );
}

export default function JobFeedPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedTotalCount, setFeedTotalCount] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [emptyQuery, setEmptyQuery] = useState(false);
  const [scoring, setScoring] = useState<Set<string>>(new Set());
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  /** Only one client rank popover open at a time across the feed. */
  const [openRankJobId, setOpenRankJobId] = useState<string | null>(null);
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  /**
   * Saved filters have been fetched. The first feed request waits on this so a
   * single-filter tenant opens straight into that filter instead of fetching
   * the merged view first and immediately refetching.
   */
  const [feedFiltersLoaded, setFeedFiltersLoaded] = useState(false);
  const [upworkConnected, setUpworkConnected] = useState<boolean | null>(null);
  /** Whether the tenant's Upwork OAuth app (Client ID + Secret) is configured. */
  const [upworkOauthReady, setUpworkOauthReady] = useState(false);
  const [jobFeedAutoRefresh, setJobFeedAutoRefresh] = useState(false);
  const [connectingUpwork, setConnectingUpwork] = useState(false);
  const [silentRefreshing, setSilentRefreshing] = useState(false);
  /** After a manual refresh completes: button stays disabled until this time (ms since epoch). */
  const [manualRefreshCooldownUntil, setManualRefreshCooldownUntil] = useState<
    number | null
  >(null);
  /** Ticks every second while a cooldown is active, to drive the button countdown. */
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  /** Saved Job Filters (for feed scope). `null` = merge all filters (one API call per saved filter). */
  const [savedFeedFilters, setSavedFeedFilters] = useState<
    { id: string; name: string }[]
  >([]);
  /** Pending dropdown selection before Apply (`null` = All filters). */
  const [pendingFeedFilterId, setPendingFeedFilterId] = useState<string | null>(
    null,
  );
  /** Applied scope for API requests. */
  const [appliedFeedFilterId, setAppliedFeedFilterId] = useState<string | null>(
    null,
  );

  /**
   * The feed is assembled from saved filters that carry keywords. With none of
   * them there is nothing to search, so refreshing (manually or on a schedule)
   * would only spend Upwork calls to return an empty list.
   */
  const hasFeedFilters = savedFeedFilters.length > 0;
  /** Only with two or more is there a scope to choose between. */
  const hasMultipleFeedFilters = savedFeedFilters.length > 1;

  const hasLoadedBeyondFirstPageRef = useRef(false);
  const autoRefreshPollInFlightRef = useRef(false);
  /** True while any non-silent first-page fetch is running (initial, filter, or manual). */
  const feedFirstPageInFlightRef = useRef(false);
  /** Manual refresh: next time the user is allowed to trigger a refetch. */
  const nextManualRefreshAllowedAtRef = useRef(0);
  /**
   * The feed scope the arrival tracker was baselined against. Switching saved
   * filters yields a different result set, so without a re-baseline every row
   * in it would read as an arrival.
   */
  const lastTrackedFeedScopeRef = useRef<string | null>(null);

  /**
   * Arm the Refresh-button cooldown ending at `until` (epoch ms).
   *
   * `nowTick` is reset in the same update on purpose. Its 1s interval only runs
   * while a cooldown is active, so between cooldowns the value freezes at the
   * moment the last one expired. Arming without resetting it would render one
   * frame of `until - staleNow`, overshooting the countdown by however long the
   * button sat idle (a 40s pause showed "3:40" before snapping back to 3:00).
   * Batching both setters means no render ever sees the stale clock.
   */
  const armRefreshCooldown = useCallback((until: number) => {
    nextManualRefreshAllowedAtRef.current = until;
    setNowTick(Date.now());
    setManualRefreshCooldownUntil(until);
  }, []);

  const {
    jobAlertsEnabled,
    jobAlertsEnabledRef,
    handleJobAlertsChange,
    processNewJobsAfterFetch,
    markJobsSeen,
    resetJobTracker,
  } = useJobAlerts({
    filterStorageKey: "job-feed",
    notificationTargetPath: "/jobs",
    needsUpworkConnection: upworkConnected === false,
  });

  const {
    isNew: isNewJob,
    markArrivals: markJobArrivals,
    reset: resetJobHighlights,
  } = useNewJobHighlight();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/settings");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setUpworkConnected(!!data.upwork_connected);
        setUpworkOauthReady(!!data.upwork_oauth_ready);
        setJobFeedAutoRefresh(!!data.job_feed_auto_refresh_enabled);
      } catch {
        if (!cancelled) setUpworkConnected(null);
      } finally {
        if (!cancelled) setSettingsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded || !upworkConnected) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/filters");
        if (!res.ok) return;
        const data = await res.json();
        const raw = (data.filters || []) as Array<{
          id: string;
          name: string;
          filters?: unknown;
          is_enabled?: boolean | null;
        }>;
        if (cancelled) return;
        // Disabled filters drop out of the scope picker entirely. The reset
        // below then clears them as the applied/pending scope for free.
        const forFeed = raw.filter((f) =>
          isSavedFilterFeedEligible({
            is_enabled: f.is_enabled ?? true,
            filters: f.filters,
          }),
        );
        setSavedFeedFilters(
          forFeed.map((f) => ({ id: f.id, name: f.name || "Untitled" })),
        );
        if (forFeed.length === 1) {
          // Exactly one filter means there is nothing to choose between, so
          // select it outright. "All filters" would fetch the same jobs but
          // through the merged path, which pages by offset and cannot load
          // more from Upwork past the first page.
          setAppliedFeedFilterId(forFeed[0].id);
          setPendingFeedFilterId(forFeed[0].id);
        } else {
          setAppliedFeedFilterId((prev) =>
            prev && !forFeed.some((f) => f.id === prev) ? null : prev,
          );
          setPendingFeedFilterId((prev) =>
            prev && !forFeed.some((f) => f.id === prev) ? null : prev,
          );
        }
      } catch {
        /* ignore */
      } finally {
        // Always flip, even on failure, or the feed effect below never runs
        // and the page sits on its spinner forever.
        if (!cancelled) setFeedFiltersLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsLoaded, upworkConnected]);

  useEffect(() => {
    if (manualRefreshCooldownUntil == null) return;
    // A already-lapsed cooldown still goes through setTimeout(0) rather than
    // clearing inline: a synchronous setState in an effect body is the
    // cascading render `react-hooks/set-state-in-effect` flags.
    const remain = Math.max(0, manualRefreshCooldownUntil - Date.now());
    const t = window.setTimeout(() => {
      setManualRefreshCooldownUntil(null);
      nextManualRefreshAllowedAtRef.current = 0;
    }, remain);
    return () => clearTimeout(t);
  }, [manualRefreshCooldownUntil]);

  // Tick every second while a cooldown is active so the button countdown updates.
  useEffect(() => {
    if (manualRefreshCooldownUntil == null) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [manualRefreshCooldownUntil]);

  const handleCopyUrl = useCallback((jobId: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedJobId(jobId);
    setTimeout(() => setCopiedJobId(null), 2000);
  }, []);

  const fetchFeedFirstPage = useCallback(
    async (options?: { silent?: boolean; manual?: boolean }) => {
      const silent = options?.silent === true;
      const isManual = options?.manual === true;
      if (!upworkConnected) return;

      if (silent) {
        if (autoRefreshPollInFlightRef.current) return;
        // Never race a manual refresh or an in-progress filter change.
        if (feedFirstPageInFlightRef.current) return;
        if (
          typeof document !== "undefined" &&
          document.visibilityState === "hidden" &&
          !jobAlertsEnabledRef.current
        ) {
          return;
        }
        autoRefreshPollInFlightRef.current = true;
        setSilentRefreshing(true);
      } else {
        if (isManual) {
          if (Date.now() < nextManualRefreshAllowedAtRef.current) {
            toast.message("Please wait before refreshing again");
            return;
          }
        }
        if (feedFirstPageInFlightRef.current) {
          if (isManual) {
            toast.info("A refresh is already in progress.");
          }
          return;
        }
        feedFirstPageInFlightRef.current = true;
        setLoading(true);
        hasLoadedBeyondFirstPageRef.current = false;
        setEmptyQuery(false);
      }

      // Deliberately not a useEffect on appliedFeedFilterId: the fetch effect
      // keys off the same value, so effect ordering would decide whether the
      // reset landed before or after the response. Doing it here sits below
      // every in-flight guard above, so a call that bails out before reaching
      // here cannot advance the ref without also resetting the tracker. It is
      // not by itself race-free against other in-flight responses: the silent
      // and non-silent branches guard on different in-flight refs, so an older
      // fetch for a different scope can still be in flight when this one
      // starts and resets. The staleness check below (after the response
      // comes back) is what bails that response out before it can touch the
      // tracker.
      // The hook's own filterStorageKey reset cannot cover this either: this
      // page passes the constant "job-feed", so that effect never fires.
      const feedScope = appliedFeedFilterId ?? "";
      if (lastTrackedFeedScopeRef.current !== feedScope) {
        lastTrackedFeedScopeRef.current = feedScope;
        resetJobTracker();
        resetJobHighlights();
      }

      try {
        const params = new URLSearchParams();
        params.set("limit", String(FEED_PAGE_SIZE));
        params.set("offset", "0");
        if (appliedFeedFilterId) {
          params.set("filterId", appliedFeedFilterId);
        }
        // `refresh=1` means "the user pressed the button", which the server
        // may throttle. A scheduled poll must never send it.
        if (isManual) {
          params.set("refresh", "1");
        }
        const res = await apiFetch(`/api/jobs/upwork-feed?${params}`);
        const data = await res.json();
        if (
          res.status === 400 &&
          typeof data.error === "string" &&
          data.error.includes("not connected")
        ) {
          setUpworkConnected(false);
          setJobs([]);
          return;
        }
        if (!res.ok) {
          if (!silent) {
            toast.error(data.error || "Failed to load jobs");
            setJobs([]);
          }
          return;
        }

        const incoming = (data.jobs || []) as Job[];

        // A later fetch for a different scope started while this response was
        // in flight, so this data is stale. Bail before it can touch the list,
        // the tracker, or the highlight set; letting it through would let it
        // re-baseline the tracker on the previous scope's ids and make the
        // next real response report the whole feed as arrivals. The silent and
        // non-silent branches guard on different in-flight refs, so the two can
        // genuinely overlap.
        if (lastTrackedFeedScopeRef.current !== feedScope) {
          return;
        }

        const arrivals = processNewJobsAfterFetch(
          incoming.map((j) => ({ id: j.id, title: j.title })),
        );
        markJobArrivals(arrivals.map((j) => j.id));

        if (silent) {
          setJobs(sortJobsByPostedAtNewestFirst(incoming));
          hasLoadedBeyondFirstPageRef.current = false;
          setFeedTotalCount(data.totalCount ?? 0);
          setHasNextPage(!!data.hasNextPage);
          setEndCursor(data.endCursor ?? null);
          setEmptyQuery(incoming.length === 0 && !!data.emptyQuery);
        } else {
          setJobs(sortJobsByPostedAtNewestFirst(incoming));
          setHasNextPage(!!data.hasNextPage);
          setEndCursor(data.endCursor ?? null);
          setFeedTotalCount(data.totalCount ?? 0);
          setEmptyQuery(!!data.emptyQuery);
        }
      } catch {
        if (!silent) {
          toast.error("Failed to load jobs");
          setJobs([]);
        }
      } finally {
        if (silent) {
          autoRefreshPollInFlightRef.current = false;
          setSilentRefreshing(false);
        } else {
          feedFirstPageInFlightRef.current = false;
          setLoading(false);
          // Local throttle so a user cannot hammer their own Upwork quota.
          if (isManual) {
            armRefreshCooldown(Date.now() + MANUAL_REFRESH_COOLDOWN_MS);
          }
        }
      }
    },
    [
      // `jobAlertsEnabledRef` is a ref, so it never changes identity, listed
      // only to satisfy exhaustive-deps.
      jobAlertsEnabledRef,
      upworkConnected,
      appliedFeedFilterId,
      processNewJobsAfterFetch,
      markJobArrivals,
      resetJobTracker,
      resetJobHighlights,
      armRefreshCooldown,
    ],
  );

  // Clearing the feed when the account is not connected is a pure derivation
  // of `upworkConnected`, so it happens on the transition during render rather
  // than as a synchronous setState inside the effect below.
  const [syncedConnected, setSyncedConnected] = useState(upworkConnected);
  if (syncedConnected !== upworkConnected) {
    setSyncedConnected(upworkConnected);
    if (upworkConnected === false) {
      setLoading(false);
      setJobs([]);
    }
  }

  useEffect(() => {
    if (!settingsLoaded || upworkConnected === null) return;
    if (!upworkConnected) {
      // Ref writes belong in an effect, not in the render-time reset above.
      hasLoadedBeyondFirstPageRef.current = false;
      return;
    }
    if (!feedFiltersLoaded) return;
    void (async () => {
      await fetchFeedFirstPage({ silent: false });
    })();
  }, [settingsLoaded, upworkConnected, feedFiltersLoaded, fetchFeedFirstPage]);

  useEffect(() => {
    if (!upworkConnected || !hasFeedFilters) return;
    if (!jobFeedAutoRefresh && !jobAlertsEnabled) return;
    const id = window.setInterval(() => {
      void fetchFeedFirstPage({ silent: true });
    }, 60_000);
    return () => clearInterval(id);
  }, [
    upworkConnected,
    hasFeedFilters,
    jobFeedAutoRefresh,
    jobAlertsEnabled,
    fetchFeedFirstPage,
  ]);


  const loadMore = async () => {
    if (!hasNextPage || loadMoreLoading || !upworkConnected) return;
    if (appliedFeedFilterId && !endCursor) return;
    setLoadMoreLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(FEED_PAGE_SIZE));
      params.set("offset", String(jobs.length));
      if (appliedFeedFilterId) {
        params.set("filterId", appliedFeedFilterId);
      }
      if (endCursor) {
        params.set("after", endCursor);
      }
      const res = await apiFetch(`/api/jobs/upwork-feed?${params}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to load more");
        return;
      }
      hasLoadedBeyondFirstPageRef.current = true;

      setJobs((prev) => {
        const seen = new Set(prev.map((j) => j.id));
        const next = [...prev];
        for (const j of data.jobs || []) {
          const job = j as Job;
          if (!seen.has(job.id)) {
            seen.add(job.id);
            next.push(job);
          }
        }
        const sorted = sortJobsByPostedAtNewestFirst(next);
        queueMicrotask(() =>
          markJobsSeen(sorted.map((j) => ({ id: j.id, title: j.title }))),
        );
        return sorted;
      });
      setHasNextPage(!!data.hasNextPage);
      setEndCursor(data.endCursor ?? null);
    } catch {
      toast.error("Failed to load more");
    } finally {
      setLoadMoreLoading(false);
    }
  };

  const applyFeedFilter = () => {
    setAppliedFeedFilterId(pendingFeedFilterId);
  };

  const feedFilterSelectionDirty =
    (pendingFeedFilterId ?? "") !== (appliedFeedFilterId ?? "");

  const handleAutoRefreshToggle = async (checked: boolean) => {
    setJobFeedAutoRefresh(checked);
    try {
      const res = await apiFetch("/api/settings/job-feed-auto-refresh", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: checked }),
      });
      if (!res.ok) {
        setJobFeedAutoRefresh(!checked);
        toast.error("Failed to save auto-refresh preference");
      }
    } catch {
      setJobFeedAutoRefresh(!checked);
      toast.error("Failed to save auto-refresh preference");
    }
  };

  const handleConnectUpwork = async () => {
    setConnectingUpwork(true);
    try {
      await redirectToUpworkOAuth();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to connect to Upwork.",
      );
      setConnectingUpwork(false);
    }
  };

  const updateJobStatus = async (jobId: string, status: string) => {
    if (isUuid(jobId)) {
      try {
        await apiFetch("/api/jobs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, status }),
        });
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, status } : j)),
        );
      } catch {
        console.error("Failed to update job");
      }
    } else {
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status } : j)),
      );
    }
  };

  const scoreJobs = async (jobIds: string[]) => {
    const dbIds = jobIds.filter(isUuid);
    if (dbIds.length === 0) {
      toast.info(
        "Fit scoring uses saved database jobs. Upwork-only listings can be reviewed without a score.",
      );
      return;
    }
    setScoring(new Set(jobIds));
    try {
      const res = await apiFetch("/api/jobs/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: dbIds }),
      });
      const data = await res.json();
      if (data.scored) {
        setJobs((prev) =>
          prev.map((j) => {
            const scored = data.scored.find(
              (s: { id: string }) => s.id === j.id,
            );
            if (scored && scored.fit_score !== null) {
              return {
                ...j,
                fit_score: scored.fit_score,
                fit_reasons: scored.fit_reasons,
                ai_summary: scored.summary,
              };
            }
            return j;
          }),
        );
      }
    } catch {
      console.error("Failed to score jobs");
    } finally {
      setScoring(new Set());
    }
  };

  const scoreAllUnscored = () => {
    const unscored = jobs
      .filter((j) => j.fit_score === null && isUuid(j.id))
      .map((j) => j.id);
    if (unscored.length > 0) scoreJobs(unscored.slice(0, 10));
  };

  const formatBudget = (job: Job): string => {
    const hasFixed = job.budget_min != null || job.budget_max != null;
    const hasHourly =
      job.hourly_rate_min != null || job.hourly_rate_max != null;

    if (hasFixed) {
      const min = job.budget_min;
      const max = job.budget_max;
      if (min != null && max != null) {
        if (min === max) {
          return `$${min.toLocaleString()} (fixed)`;
        }
        return `$${min.toLocaleString()}-${max.toLocaleString()} (fixed)`;
      }
      if (max != null) {
        return `$${max.toLocaleString()} (fixed)`;
      }
      if (min != null) {
        return `$${min.toLocaleString()} (fixed)`;
      }
    }

    if (hasHourly) {
      const min = job.hourly_rate_min;
      const max = job.hourly_rate_max;
      if (min != null && max != null) {
        if (min === max) {
          return `$${min}/hr`;
        }
        return `$${min}-${max}/hr`;
      }
      if (max != null) {
        return `$${max}/hr`;
      }
      if (min != null) {
        return `$${min}/hr`;
      }
    }

    return "Not specified";
  };

  // Takes `nowTick` rather than reading the clock: `Date.now()` during render
  // is an impure call the React lint rule rejects, and threading the ticking
  // value through means these labels also refresh on their own.
  const timeAgo = (dateStr: string | null, nowMs: number) => {
    if (!dateStr) return "Unknown";
    const ms = postedAtMsForSort(dateStr);
    if (!Number.isFinite(ms)) return "Unknown";
    // Clamped: Upwork's clock can read a little ahead of the browser's, so a
    // job posted seconds ago can yield a negative diff and floor to "-1m ago".
    const diff = Math.max(0, nowMs - ms);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };


  const unscoredCount = jobs.filter(
    (j) => j.fit_score === null && isUuid(j.id),
  ).length;

  const showFeedSpinner =
    !settingsLoaded || (upworkConnected === true && loading);

  const feedManualRefreshOnCooldown =
    manualRefreshCooldownUntil !== null &&
    nowTick < manualRefreshCooldownUntil &&
    !loading;

  // Countdown for the Refresh button. `nowTick` forces
  // this to recompute each second while a cooldown is active.
  const cooldownRemainingSec =
    manualRefreshCooldownUntil !== null
      ? Math.max(0, Math.ceil((manualRefreshCooldownUntil - nowTick) / 1000))
      : 0;
  const cooldownLabel = `${Math.floor(cooldownRemainingSec / 60)}:${String(
    cooldownRemainingSec % 60,
  ).padStart(2, "0")}`;


  return (
    <div className="flex flex-col h-full">
      {upworkConnected === false ? (
        <UpworkAccessBanner
          oauthReady={upworkOauthReady}
          connecting={connectingUpwork}
          onConnect={() => void handleConnectUpwork()}
          connectTitle="Connect Upwork to load the Job Feed"
          connectDescription="Authorize this app to search Upwork job postings. Jobs are matched using keywords from your saved filters (Job Filters page)."
        />
      ) : null}



      {showFeedSpinner ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 min-h-[50vh]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Loading job feed…
          </span>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="">
            <div className="flex flex-col gap-4 mb-6">
              <div>
                <div className="flex gap-4 items-end">
                  <h1 className="text-base md:text-2xl xl:text-4xl font-bold">
                    Job Feed
                  </h1>
                  <p className="text-sm py-1 px-3 rounded-full text-gray-900 bg-[#E1E3E2]">
                    {feedTotalCount} jobs{" "}
                    {/* {statusFilter !== "all" ? `(${statusFilter})` : ""} */}
                    {unscoredCount > 0 && ` | ${unscoredCount} unscored`}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Live Upwork jobs matched to your filters.
                </p>
              </div>
              {/* Feed controls sit on their own row beneath the title block. */}
              <div className="flex flex-wrap items-center gap-3">
                {upworkConnected ? (
                  <>
                    <div
                      className="flex items-center gap-2 rounded-lg border px-3 py-1.5 bg-muted/40"
                      title={
                        "Notify with sound when new jobs match this feed. Desktop notifications when the tab is in the background (permission required). When enabled, feed polling can continue in a background tab."
                      }
                    >
                      <Switch
                        id="job-feed-job-alerts"
                        checked={jobAlertsEnabled}
                        onCheckedChange={(v) => void handleJobAlertsChange(v)}
                        aria-label="Job alerts: sound and optional desktop notifications when new jobs match"
                      />
                      <Label
                        htmlFor="job-feed-job-alerts"
                        className="text-xs cursor-pointer flex items-center gap-1.5"
                      >
                        <Bell
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        Job alerts
                      </Label>
                    </div>
                    <div
                      className="flex items-center gap-2 rounded-lg border px-3 py-1.5 bg-muted/40"
                      title={
                        !hasFeedFilters
                          ? "Add a filter with keywords first, then auto-refresh can pull matching jobs."
                          : "Refreshes job listings every minute while this page is open. When job alerts are on, polling continues in a background tab so new jobs can still notify you."
                      }
                    >
                      <Switch
                        id="job-feed-auto-refresh"
                        checked={jobFeedAutoRefresh}
                        disabled={!hasFeedFilters}
                        onCheckedChange={(v) => void handleAutoRefreshToggle(v)}
                      />
                      <Label
                        htmlFor="job-feed-auto-refresh"
                        className="text-xs cursor-pointer flex items-center gap-1.5"
                      >
                        {silentRefreshing ? (
                          <Loader2
                            className="h-3 w-3 animate-spin text-muted-foreground shrink-0"
                            aria-hidden
                          />
                        ) : null}
                        Auto-refresh
                      </Label>
                    </div>
                  </>
                ) : null}
                {unscoredCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={scoreAllUnscored}
                    disabled={scoring.size > 0}
                    className="gap-2"
                  >
                    {scoring.size > 0 ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Score All ({Math.min(unscoredCount, 10)})
                  </Button>
                )}
                <Button asChild variant="outline" className="gap-2" size="lg">
                  <a
                    href="https://chromewebstore.google.com/detail/proposal-lift/nlfndcnmhelfplpiipkiggchpbcebhpi"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Zap className="h-4 w-4" />
                    Get Chrome Extension
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() =>
                    void fetchFeedFirstPage({ silent: false, manual: true })
                  }
                  disabled={
                    !upworkConnected ||
                    !hasFeedFilters ||
                    loading ||
                    feedManualRefreshOnCooldown
                  }
                  title={
                    !hasFeedFilters
                      ? "Add a filter with keywords first, then there will be jobs to refresh."
                      : feedManualRefreshOnCooldown
                        ? "Please wait before refreshing again"
                        : undefined
                  }
                  aria-busy={loading}
                  className="gap-2 min-w-34"
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4 shrink-0",
                      loading && "animate-spin",
                      !loading && "cursor-pointer",
                    )}
                    aria-hidden
                  />
                  {loading
                    ? "Refreshing…"
                    : feedManualRefreshOnCooldown
                      ? `Refresh in ${cooldownLabel}`
                      : "Refresh"}
                </Button>
              </div>
            </div>
            {/* Scope picker is meaningless until at least one feed-eligible
              filter exists, so the whole row is dropped rather than shown
              with only the "All saved filters" placeholder. */}
            {upworkConnected && savedFeedFilters.length > 0 ? (
              <div className=" flex justify-end mb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={pendingFeedFilterId ?? "__all__"}
                      onValueChange={(v) =>
                        setPendingFeedFilterId(v === "__all__" ? null : v)
                      }
                    >
                      <SelectTrigger
                        size="default"
                        className="w-[min(100vw-8rem,16rem)] data-[size=default]:h-10 text-[15px]"
                        aria-label="Job feed saved filter"
                      >
                        <SelectValue placeholder="Filter scope" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* With a single filter there is no scope to pick, so
                          the merged option is left out and that filter is
                          already applied. */}
                        {hasMultipleFeedFilters ? (
                          <SelectItem value="__all__">
                            All saved filters
                          </SelectItem>
                        ) : null}
                        {savedFeedFilters.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {hasMultipleFeedFilters ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!feedFilterSelectionDirty || loading}
                        onClick={applyFeedFilter}
                        className="bg-accent hover:bg-accent/90 cursor-pointer"
                        size="lg"
                      >
                        Apply
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Empty / onboarding */}
          {settingsLoaded &&
            upworkConnected &&
            !showFeedSpinner &&
            emptyQuery && (
              <div className="flex-1 flex items-center justify-center py-16">
                <div className="text-center max-w-md space-y-4">
                  <Briefcase className="h-12 w-12 mx-auto text-muted-foreground" />
                  <h2 className="text-xl font-semibold">
                    Add a filter with keywords to see jobs
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Your feed is built from your saved filters. Go to Job
                    Filters, create one, and add at least one keyword for the
                    kind of work you want. Matching jobs will show up here.
                  </p>
                  <Button asChild>
                    <Link href="/filters">Go to Job Filters</Link>
                  </Button>
                </div>
              </div>
            )}

          {settingsLoaded &&
            upworkConnected &&
            !showFeedSpinner &&
            !emptyQuery &&
            jobs.length === 0 && (
              <div className="flex-1 flex items-center justify-center py-16 text-muted-foreground text-sm">
                No jobs matched your keywords right now. Try refreshing or
                adjusting terms in Job Filters.
              </div>
            )}

          {settingsLoaded && upworkConnected === false && !showFeedSpinner && (
            <div className="flex-1 flex items-center justify-center -mt-8">
              <div className="text-center max-w-lg text-muted-foreground text-sm">
                <p>
                  Connect your Upwork account above to load live job postings
                  from the API.
                </p>
              </div>
            </div>
          )}

          {/* Job List */}
          {!showFeedSpinner && jobs.length > 0 && (
            <div className="space-y-3">
              {jobs.map((job) => {
                const budgetLabel = formatBudget(job);
                const budgetUnspecified = budgetLabel === "Not specified";
                const clientRank = computeClientRankScore(job);
                return (
                  <div
                    key={job.id}
                    className={cn(
                      "border rounded-xl overflow-hidden transition-all hover:shadow-md",
                      job.status === "skipped" && "opacity-50",
                      // A ring, not a border: rings do not participate in
                      // layout, so the card does not shift when the highlight
                      // appears or clears. Ternary, not `&&`: twMerge strips
                      // bg-card when the highlight background is also present,
                      // so exactly one background class must be emitted.
                      //
                      // The blue is hardcoded rather than themed so it matches
                      // the filter feed's row highlight exactly (same hex in
                      // filter/[id]/page.tsx). Theme tokens are wrong for this:
                      // --primary is the lime brand accent used by buttons, so
                      // a row tinted with it reads as "selected" rather than
                      // "new", and blue is the only signal colour neither feed
                      // already spends on something else.
                      isNewJob(job.id)
                        ? "bg-[#EFF6FF] ring-1 ring-[#2563EB]"
                        : "bg-card",
                    )}
                  >
                    {/* Main Row */}
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="font-bold text-base truncate">
                                {job.title}
                              </h3>
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {job.ai_summary ||
                                  job.description?.slice(0, 200) ||
                                  "No description"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {/* Client rank: same badge and popover the filter
                                  feed uses. `total_applicants` is this shape's
                                  `proposals_count` under Upwork's own name. */}
                              <ClientRankPopover
                                job={{
                                  ...job,
                                  total_applicants: job.proposals_count,
                                }}
                                rank={clientRank}
                                open={openRankJobId === job.id}
                                onOpenChange={(v) =>
                                  setOpenRankJobId(v ? job.id : null)
                                }
                              >
                                <ClientRankBadge
                                  status={clientRank.status}
                                  className={
                                    clientRank.score == null
                                      ? CLIENT_RANK_UNKNOWN_BADGE_CLASS
                                      : CLIENT_RANK_BADGE_CLASS[
                                          clientRank.score
                                        ]
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </ClientRankPopover>
                              {/* Upwork's own applied flag, which saves the user
                                  opening a job they already bid on. */}
                              {job.already_applied && (
                                <span className="flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                                  <Check
                                    className="h-3.5 w-3.5 shrink-0"
                                    strokeWidth={2.5}
                                  />
                                  Applied
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <Clock
                                  className="h-3.5 w-3.5 shrink-0 text-foreground/70"
                                  strokeWidth={2.25}
                                />
                                {timeAgo(job.posted_at, nowTick)}
                              </span>
                            </div>
                          </div>

                          {/* Meta Row */}
                          <div className="flex flex-wrap items-center gap-3 mt-3">
                            {/* No currency icon here: formatBudget already
                                prefixes the amount with "$". */}
                            <span
                              className={`text-xs ${
                                budgetUnspecified
                                  ? "text-muted-foreground font-normal"
                                  : "font-bold text-green-600 dark:text-green-500"
                              }`}
                            >
                              {budgetLabel}
                            </span>
                            {job.experience_level && (
                              <Badge
                                variant="outline"
                                className="text-[10px] capitalize"
                              >
                                {job.experience_level}
                              </Badge>
                            )}
                            {job.client_country && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <MapPin
                                  className="h-3.5 w-3.5 shrink-0 text-foreground/70"
                                  strokeWidth={2.25}
                                />
                                {job.client_country}
                              </span>
                            )}
                            {job.client_payment_verified && (
                              <span className="text-xs font-medium text-green-600 dark:text-green-500 flex items-center gap-1.5">
                                <ShieldCheck
                                  className="h-3.5 w-3.5 shrink-0"
                                  strokeWidth={2.25}
                                />
                                Verified
                              </span>
                            )}
                            {job.client_total_spent !== null &&
                              job.client_total_spent > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  Spent: $
                                  {(job.client_total_spent / 1000).toFixed(0)}K
                                </span>
                              )}
                            {/* Competition: applicant count, coloured by band. */}
                            {(() => {
                              const level = getCompetitionLevel(
                                job.proposals_count,
                              );
                              if (!level) return null;
                              return (
                                <span
                                  title={
                                    getCompetitionTooltip(
                                      job.proposals_count,
                                    ) ?? undefined
                                  }
                                  className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-semibold ${COMPETITION_BADGE_CLASS[level]}`}
                                >
                                  <Users
                                    className="h-3.5 w-3.5 shrink-0"
                                    strokeWidth={2.25}
                                  />
                                  {job.proposals_count} applicants
                                </span>
                              );
                            })()}
                            {job.connects_required !== null && (
                              <span className="text-xs text-muted-foreground">
                                {job.connects_required} connects
                              </span>
                            )}
                          </div>

                          {/* Skills */}
                          {job.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {job.skills.map((skill, index) => (
                                <Badge
                                  key={index}
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  {skill}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* Fit Reasons */}
                          {job.fit_reasons && job.fit_reasons.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {job.fit_reasons.map((reason, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full"
                                >
                                  {reason}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Bar */}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setExpandedJob(
                                expandedJob === job.id ? null : job.id,
                              )
                            }
                            className="gap-1 text-xs"
                          >
                            <Eye className="h-3.5 w-3.5" strokeWidth={2.25} />
                            Details
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform ${
                                expandedJob === job.id ? "rotate-180" : ""
                              }`}
                              strokeWidth={2.25}
                            />
                          </Button>
                          {job.url && (
                            <>
                              <a
                                href={buildUpworkJobUrl(job.title, job.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1 text-xs"
                                >
                                  <ExternalLink
                                    className="h-3.5 w-3.5"
                                    strokeWidth={2.25}
                                  />
                                  Upwork
                                </Button>
                              </a>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="px-2"
                                onClick={() =>
                                  handleCopyUrl(
                                    job.id,
                                    buildUpworkJobUrl(job.title, job.url!),
                                  )
                                }
                                aria-label="Copy Upwork link"
                              >
                                {copiedJobId === job.id ? (
                                  <Check
                                    className="h-3.5 w-3.5 text-green-600 dark:text-green-500"
                                    strokeWidth={2.5}
                                  />
                                ) : (
                                  <Copy
                                    className="h-3.5 w-3.5"
                                    strokeWidth={2.25}
                                  />
                                )}
                              </Button>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="gap-1 text-xs bg-primary hover:bg-primary/90"
                            onClick={() => {
                              updateJobStatus(job.id, "applied");
                              const { budget, budgetKind } =
                                jobBudgetPrefill(job);
                              const key = storeJobPrefill({
                                jobTitle: job.title,
                                jobDescription: job.description || "",
                                skills: Array.isArray(job.skills)
                                  ? job.skills
                                  : [],
                                budget,
                                budgetKind:
                                  budgetKind === "none"
                                    ? undefined
                                    : budgetKind,
                                experienceLevel:
                                  job.experience_level || undefined,
                              });
                              router.push(`/proposals/new?prefillKey=${key}`);
                            }}
                          >
                            <Send className="h-3.5 w-3.5" strokeWidth={2.25} />
                            Quick Apply
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedJob === job.id && (
                      <div className="px-5 pb-5 border-t bg-muted/30">
                        <div className="pt-4 space-y-4">
                          {/* Full Description */}
                          <div>
                            <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">
                              Full Description
                            </h4>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">
                              {job.description || "No description available"}
                            </p>
                          </div>

                          {/* Client Details */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-background rounded-lg p-3">
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">
                                Total Spent
                              </p>
                              <p className="text-sm font-bold mt-1">
                                {job.client_total_spent
                                  ? `$${job.client_total_spent.toLocaleString()}`
                                  : "N/A"}
                              </p>
                            </div>
                            <div className="bg-background rounded-lg p-3">
                              <p className="text-[10px] text-muted-foreground uppercase font-bold">
                                Payment
                              </p>
                              <p className="text-sm font-bold mt-1">
                                {job.client_payment_verified ? (
                                  <span className="text-green-600 dark:text-green-500 flex items-center gap-1.5">
                                    <ShieldCheck
                                      className="h-4 w-4 shrink-0"
                                      strokeWidth={2.25}
                                    />{" "}
                                    Verified
                                  </span>
                                ) : (
                                  <span className="text-yellow-600 dark:text-yellow-500 flex items-center gap-1.5">
                                    <AlertTriangle
                                      className="h-4 w-4 shrink-0"
                                      strokeWidth={2.25}
                                    />{" "}
                                    Unverified
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!showFeedSpinner &&
            upworkConnected &&
            hasNextPage &&
            !emptyQuery && (
              <div className="flex justify-center mt-6 mb-4">
                <Button
                  variant="outline"
                  onClick={() => void loadMore()}
                  disabled={loadMoreLoading}
                  className="gap-2 min-w-[128px]"
                >
                  {loadMoreLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Load more
                </Button>
              </div>
            )}
        </>
      )}
    </div>
  );
}
