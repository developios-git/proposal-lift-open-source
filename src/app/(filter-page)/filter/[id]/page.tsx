"use client";

import { apiFetch } from "@/lib/api-fetch";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
  useMemo,
  type ReactNode,
  Fragment,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Hash,
  DollarSign,
  User,
  SlidersHorizontal,
  Globe,
  Filter,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  MoreVertical,
  Bell,
  Settings,
  Send,
  Clock,
  Calendar,
  GraduationCap,
  Briefcase,
  Plus,
  Loader2,
  RefreshCw,
  ChevronLeft,
  X,
  Pencil,
  Sparkles,
  Info,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MAX_FILTER_KEYWORD_TERMS,
  MAX_KEYWORD_LENGTH,
} from "@/lib/filters/keyword-limits";
import { MAX_FILTERS_PER_USER, atFilterLimit } from "@/lib/filters/filter-limits";
import { resolveNameCommit } from "@/lib/filters/resolve-name-commit";
import type { SavedJobFilter, FilterCriteria } from "@/types";
import { DEFAULT_FILTER_CRITERIA } from "@/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  normalizeIso8601Offset,
  postedAtMsForSort,
} from "@/lib/jobs/posted-at-ms";
import { computeClientRankScore } from "@/lib/client-rank";
import {
  jobMatchesCountryFilters,
  normalizeJobCountryToCanonical,
} from "@/lib/country-filter";
import { CountryFlag } from "@/components/CountryFlag";
import {
  hasActiveFreelancerLocationFilter,
  jobMatchesFreelancerLocationFilters,
} from "@/lib/jobs/freelancer-location-filter";
import { HIRE_RATE_MAX } from "@/lib/jobs/client-hire-rate";
import {
  APPLICANTS_RANGE_MAX,
  APPLICANTS_RANGE_MIN,
  APPLICANTS_RANGE_STEP,
  getCompetitionLevel,
  getCompetitionTooltip,
  type CompetitionLevel,
} from "@/lib/jobs/competition-level";
import { Slider } from "@/components/ui/slider";
import {
  ClientRankBadge,
  ClientRankPopover,
} from "@/components/ClientRankPopover";
import { ClientCountryFilterControls } from "@/components/filter/ClientCountryFilterControls";
import { QualifyCriteriaPanel } from "@/components/filter/QualifyCriteriaPanel";
import {
  QualifyBadge,
  type QualifyBadgeState,
} from "@/components/filter/QualifyBadge";
import { QUALIFY_CRITERIA_MAX_LENGTH } from "@/lib/jobs/qualify/constants";
import { qualifyCacheKey } from "@/lib/jobs/qualify/qualify-cache-key";
import { storeJobPrefill } from "@/lib/prefill";
import { jobBudgetPrefill } from "@/lib/jobs/job-budget-prefill";
import { FILTER_DISABLED_CODE } from "@/lib/jobs/saved-filter-feed-eligible";
import { isUpworkConnectionError } from "@/lib/upwork/connection-ui";
import { redirectToUpworkOAuth } from "@/lib/upwork/start-oauth";
import { useJobAlerts } from "@/lib/job-alerts/useJobAlerts";
import { useNewJobHighlight } from "@/lib/jobs/use-new-job-highlight";
import { useCreateFilter } from "@/lib/filters/useCreateFilter";

/**
 * Auto-refresh poll interval.
 *
 * Upstream this came from `getAutoRefreshJobsPollMs(plan)`, which polled every
 * 60s on paid plans and 120s on free. There are no plans, and the request costs
 * the user's own Upwork quota either way, so the slower interval is the honest
 * default.
 */
const AUTO_REFRESH_JOBS_POLL_MS = 120_000;
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Competition badge colours for the feed row. Kept local because this page uses
 * the fixed light palette; the Jobs dashboard uses theme tokens instead. Only
 * the thresholds are shared, via lib/jobs/competition-level.
 */
const COMPETITION_BADGE_CLASS: Record<CompetitionLevel, string> = {
  low: "bg-[#E8F5E9] text-[#2E7D32]",
  medium: "bg-[#FFF8E1] text-[#EF6C00]",
  high: "bg-[#FFEBEE] text-[#C62828]",
};

interface Job {
  id: string;
  title: string;
  description: string | null;
  skills: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  hourly_rate_min: number | null;
  hourly_rate_max: number | null;
  posted_at: string | null;
  fit_score: number | null;
  ciphertext: string | null;
  connects_required?: number | null;
  proposals_count?: number | null;
  client_total_spent?: number | null;
  client_total_hires?: number | null;
  client_total_posted_jobs?: number | null;
  client_avg_rating?: number | null;
  client_total_reviews?: number | null;
  client_country?: string | null;
  client_city?: string | null;
  client_payment_verified?: boolean | null;
  /** Upwork's `hasFinancialPrivacy`, which explains a null `client_total_spent`. */
  has_financial_privacy?: boolean | null;
  client_member_since?: string | null;
  /** What the client last hired someone for. Unrelated to this posting. */
  client_last_contract_title?: string | null;
  experience_level?: string | null;
  duration?: string | null;
  workload?: string | null;
  category?: string | null;
  subcategory?: string | null;
  total_applicants?: number | null;
  /** Set only when the client re-posted the listing. */
  renewed_at?: string | null;
  /** Countries the client prefers freelancers from. Empty means no preference. */
  preferred_freelancer_locations?: string[] | null;
  /** Upwork reports the connected account already submitted a proposal here. */
  already_applied?: boolean;
}

/** Map Upwork API job format to our Job interface */
function mapUpworkJobToDisplayJob(raw: {
  id: string;
  title: string;
  ciphertext: string | null;
  description?: string | null;
  createdDateTime?: string | null;
  amount?: {
    rawValue?: string | number | null;
    currency?: string | null;
  } | null;
  hourlyBudgetMin?: {
    rawValue?: string | number | null;
    currency?: string | null;
    displayValue?: string | null;
  } | null;
  hourlyBudgetMax?: {
    rawValue?: string | number | null;
    currency?: string | null;
    displayValue?: string | null;
  } | null;
  skills?: Array<{ name?: string; prettyName?: string }> | null;
  experienceLevel?: string | null;
  duration?: string | null;
  durationLabel?: string | null;
  engagement?: string | null;
  category?: string | null;
  subcategory?: string | null;
  totalApplicants?: number | null;
  renewedDateTime?: string | null;
  preferredFreelancerLocation?: string[] | null;
  applied?: boolean | null;
  client?: {
    totalSpent?: { rawValue?: number | string | null } | null;
    totalHires?: number | null;
    totalPostedJobs?: number | null;
    totalReviews?: number | null;
    /** Upwork's name for the client's average star rating. */
    totalFeedback?: number | string | null;
    memberSinceDateTime?: string | null;
    lastContractTitle?: string | null;
    verificationStatus?: string | null;
    hasFinancialPrivacy?: boolean | null;
    location?: { country?: string | null; city?: string | null } | null;
  } | null;
}): Job {
  const hourlyMin =
    raw.hourlyBudgetMin?.rawValue != null
      ? parseFloat(String(raw.hourlyBudgetMin.rawValue))
      : null;
  const hourlyMax =
    raw.hourlyBudgetMax?.rawValue != null
      ? parseFloat(String(raw.hourlyBudgetMax.rawValue))
      : null;
  // Treat as hourly if: engagement has "hour"/"hr", OR we have hourlyBudgetMin/Max (definitive)
  const hasHourlyBudget = hourlyMin != null || hourlyMax != null;
  const engagementLower = raw.engagement?.toLowerCase() ?? "";
  const isHourly =
    hasHourlyBudget ||
    engagementLower.includes("hour") ||
    engagementLower.includes("hr");

  const amountVal =
    raw.amount?.rawValue != null
      ? parseFloat(String(raw.amount.rawValue))
      : null;

  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? null,
    skills:
      raw.skills?.map((s) => s.prettyName || s.name || "").filter(Boolean) ??
      null,
    budget_min: !isHourly ? amountVal : null,
    budget_max: !isHourly ? amountVal : null,
    hourly_rate_min: isHourly ? hourlyMin : null,
    hourly_rate_max: isHourly ? hourlyMax : null,
    posted_at:
      raw.createdDateTime != null
        ? normalizeIso8601Offset(String(raw.createdDateTime))
        : null,
    fit_score: null,
    ciphertext: raw.ciphertext
      ? `https://www.upwork.com/jobs/${raw.title.replace(/[ /]/g, "-")}_${raw.ciphertext}/?referrer_url_path=/nx/search/jobs/`
      : null,

    experience_level: raw.experienceLevel ?? null,
    duration: raw.durationLabel ?? raw.duration ?? null,
    workload: raw.engagement ?? null,
    category: raw.category ?? null,
    subcategory: raw.subcategory ?? null,
    total_applicants: raw.totalApplicants ?? null,
    renewed_at:
      raw.renewedDateTime != null
        ? normalizeIso8601Offset(String(raw.renewedDateTime))
        : null,
    preferred_freelancer_locations: raw.preferredFreelancerLocation ?? null,
    already_applied: raw.applied === true,
    client_total_spent:
      raw.client?.totalSpent?.rawValue != null
        ? parseFloat(String(raw.client.totalSpent.rawValue))
        : null,
    client_total_hires: raw.client?.totalHires ?? null,
    client_total_posted_jobs: raw.client?.totalPostedJobs ?? null,
    client_total_reviews: raw.client?.totalReviews ?? null,
    client_avg_rating:
      raw.client?.totalFeedback != null
        ? parseFloat(String(raw.client.totalFeedback))
        : null,
    client_country: raw.client?.location?.country ?? null,
    client_city: raw.client?.location?.city ?? null,
    client_payment_verified: raw.client?.verificationStatus === "VERIFIED",
    // Absent means "not hidden", not "unknown": the field is non-null in
    // Upwork's schema, so only a stripped payload leaves it undefined.
    has_financial_privacy:
      raw.client?.hasFinancialPrivacy != null
        ? raw.client.hasFinancialPrivacy === true
        : null,
    client_member_since: raw.client?.memberSinceDateTime ?? null,
    client_last_contract_title: raw.client?.lastContractTitle ?? null,
  };
}

function mergeWithDefaults(
  criteria: Record<string, unknown> | null,
): FilterCriteria {
  const def = DEFAULT_FILTER_CRITERIA as FilterCriteria;
  if (!criteria || typeof criteria !== "object") return def;
  return {
    keywords: {
      ...def.keywords,
      ...(criteria.keywords as object),
    } as FilterCriteria["keywords"],
    job_terms: {
      ...def.job_terms,
      ...(criteria.job_terms as object),
    } as FilterCriteria["job_terms"],
    client_details: {
      ...def.client_details,
      ...(criteria.client_details as object),
    } as FilterCriteria["client_details"],
    freelancer_location: {
      ...def.freelancer_location,
      ...(criteria.freelancer_location as object),
    } as FilterCriteria["freelancer_location"],
    freelancer_qualifications: {
      ...def.freelancer_qualifications,
      ...(criteria.freelancer_qualifications as object),
    } as FilterCriteria["freelancer_qualifications"],
    advanced_job_preferences: {
      ...def.advanced_job_preferences,
      ...(criteria.advanced_job_preferences as object),
    } as FilterCriteria["advanced_job_preferences"],
    sites_categories: (criteria.sites_categories ?? {}) as Record<
      string,
      unknown
    >,
    advanced_filters: (criteria.advanced_filters ?? {}) as Record<
      string,
      unknown
    >,
  };
}

/**
 * Infer project_length from Upwork duration/durationLabel string.
 * Upwork returns values like "Less than 1 month", "1 to 3 months", etc.
 */
function parseDurationToProjectLength(
  duration: string | null | undefined,
): string | null {
  if (!duration || typeof duration !== "string") return null;
  const d = duration.toLowerCase().trim();
  if (d.includes("more than 6") || d.includes("6+") || d.includes("> 6"))
    return "more_than_6_months";
  if (
    d.includes("3 to 6") ||
    d.includes("3-6") ||
    d.includes("3–6") ||
    d.includes("3 and 6")
  )
    return "3_to_6_months";
  if (
    d.includes("1 to 3") ||
    d.includes("1-3") ||
    d.includes("1–3") ||
    d.includes("1 and 3")
  )
    return "1_to_3_months";
  if (
    d.includes("less than 1") ||
    d.includes("less than a month") ||
    d.includes("< 1") ||
    d.includes("<1") ||
    (d.includes("less than") && d.includes("month"))
  )
    return "less_than_month";
  return null;
}

/** Normalize Upwork experience level to our format (entry/intermediate/expert). */
function normalizeExperienceLevel(
  level: string | null | undefined,
): string | null {
  if (!level || typeof level !== "string") return null;
  const l = level.toLowerCase();
  if (l.includes("entry") || l.includes("beginner")) return "entry";
  if (l.includes("intermediate") || l.includes("inter")) return "intermediate";
  if (l.includes("expert") || l.includes("senior")) return "expert";
  return null;
}

/**
 * "3 hours ago". Shared by the Published column and the AI Qualify payload.
 * The model is given the age as text because it cannot derive it from a
 * timestamp without knowing the current time.
 */
function formatPostedAge(postedAt: string | null | undefined): string | null {
  if (!postedAt) return null;
  const ms = postedAtMsForSort(postedAt);
  if (!Number.isFinite(ms)) return null;
  // Clamped for the same clock-skew reason as the Jobs feed's timeAgo: Upwork
  // can report a posting a few seconds into the browser's future.
  const d = Math.max(0, Date.now() - ms);
  if (d < 60000) return "just now";
  const m = Math.floor(d / 60000);
  if (m < 60) return `${m} ${m === 1 ? "minute" : "minutes"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(h / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

const HIGHLIGHT_MAX_TERMS = 40;
const HIGHLIGHT_MAX_TERM_LENGTH = 200;

function findLiteralMatchRanges(
  text: string,
  term: string,
): [number, number][] {
  if (term.length === 0 || term.length > HIGHLIGHT_MAX_TERM_LENGTH) {
    return [];
  }
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  const out: [number, number][] = [];
  let pos = 0;
  while (pos <= text.length - needle.length) {
    const idx = lower.indexOf(needle, pos);
    if (idx === -1) {
      break;
    }
    out.push([idx, idx + needle.length]);
    pos = idx + 1;
  }
  return out;
}

function mergeHighlightRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length === 0) {
    return [];
  }
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    const prev = merged[merged.length - 1];
    if (s <= prev[1]) {
      prev[1] = Math.max(prev[1], e);
    } else {
      merged.push([s, e]);
    }
  }
  return merged;
}

function normalizeHighlightTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    const s = typeof t === "string" ? t.trim() : String(t).trim();
    if (!s || s.length > HIGHLIGHT_MAX_TERM_LENGTH) {
      continue;
    }
    const k = s.toLowerCase();
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(s);
    if (out.length >= HIGHLIGHT_MAX_TERMS) {
      break;
    }
  }
  return out;
}

/** Case-insensitive literal match, merged spans; React text nodes + <mark> only (safe for untrusted job text). */
function highlightKeywordSegments(text: string, terms: string[]): ReactNode {
  const norm = normalizeHighlightTerms(terms);
  if (!text || norm.length === 0) {
    return text;
  }

  const ranges: [number, number][] = [];
  for (const term of norm) {
    ranges.push(...findLiteralMatchRanges(text, term));
  }
  if (ranges.length === 0) {
    return text;
  }

  const merged = mergeHighlightRanges(ranges);
  const parts: ReactNode[] = [];
  let markKey = 0;
  let cursor = 0;
  for (const [s, e] of merged) {
    if (s > cursor) {
      parts.push(text.slice(cursor, s));
    }
    parts.push(
      <mark key={`kw-${markKey++}`} className="bg-[#FFFACD]">
        {text.slice(s, e)}
      </mark>,
    );
    cursor = e;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  if (parts.length === 0) {
    return text;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  );
}

/** Collapsible filter section - defined at module level to prevent remount on parent re-render (fixes scroll jump). */
function FilterSection({
  id: sectionId,
  icon: Icon,
  title,
  badge,
  hasActive,
  expandedSections,
  onToggleSection,
  children,
}: {
  id: string;
  icon: React.ElementType;
  title: string;
  badge?: number | string;
  hasActive?: boolean;
  expandedSections: Record<string, boolean>;
  onToggleSection: (key: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => onToggleSection(sectionId)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {badge != null && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {badge}
            </span>
          )}
          {hasActive && (
            <span className="flex h-4 w-4 items-center justify-center rounded bg-primary/20 text-[10px] text-primary shrink-0">
              ✓
            </span>
          )}
        </div>
        <span
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-300 ease-in-out",
            expandedSections[sectionId] && "rotate-180",
          )}
        >
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
          expandedSections[sectionId] ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border bg-muted/20 px-4 py-3 text-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FilterPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [name, setName] = useState("Untitled");
  const [criteria, setCriteria] = useState<FilterCriteria>(
    DEFAULT_FILTER_CRITERIA as FilterCriteria,
  );
  /** Last-persisted snapshot of criteria, diffed against `criteria` to drive the dirty state / Save button. */
  const [savedCriteria, setSavedCriteria] = useState<FilterCriteria>(
    DEFAULT_FILTER_CRITERIA as FilterCriteria,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allFilters, setAllFilters] = useState<SavedJobFilter[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [silentJobsRefresh, setSilentJobsRefresh] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [loadMoreCursor, setLoadMoreCursor] = useState<
    string | Record<string, string | null> | null
  >(null);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  /** True when Upwork OAuth is missing or API reports not connected; show banner and empty-state CTA. */
  const [needsUpworkConnection, setNeedsUpworkConnection] = useState(false);
  /** Whether the tenant's Upwork OAuth app (Client ID + Secret) is configured. */
  const [upworkOauthReady, setUpworkOauthReady] = useState(false);
  const [connectingUpwork, setConnectingUpwork] = useState(false);
  const needsUpworkConnectionRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const autoRefreshPollInFlightRef = useRef(false);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    keywords: false,
    job_terms: false,
    client_details: false,
    client_country: false,
    freelancer_location: false,
    freelancer_qualifications: false,
    advanced_job_preferences: false,
    sites_categories: false,
    advanced_filters: false,
  });
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  /** Working copy of the filter name while the inline field has focus. */
  const [nameDraft, setNameDraft] = useState(name);
  const [nameSaving, setNameSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  /** Set by Escape so the blur it triggers doesn't turn around and commit. */
  const skipNameCommitRef = useRef(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** The sidebar is a two-mode panel: the filter sections, or the AI Qualify criteria editor. */
  const [sidebarMode, setSidebarMode] = useState<"filters" | "qualify">(
    "filters",
  );
  const [qualifyCriteria, setQualifyCriteria] = useState("");
  /** Last-persisted criteria, diffed against `qualifyCriteria` to drive the Save criteria button. */
  const [savedQualifyCriteria, setSavedQualifyCriteria] = useState("");
  const [qualifyEnabled, setQualifyEnabled] = useState(false);
  const [qualifySaving, setQualifySaving] = useState(false);
  const [qualifyEnhancing, setQualifyEnhancing] = useState(false);
  /**
   * Text from before the last wholesale replacement: an enhance, or an inserted
   * example, so either can be undone. `label` names which, so the control does
   * not claim to undo an enhance the user never ran.
   */
  const [criteriaUndo, setCriteriaUndo] = useState<{
    text: string;
    label: string;
  } | null>(null);
  /** Per-job verdicts for the current criteria. Mirrored to sessionStorage. */
  const [qualifyResults, setQualifyResults] = useState<
    Record<string, QualifyBadgeState>
  >({});
  const { createFilter, creating: creatingFilter } = useCreateFilter();

  useEffect(() => {
    needsUpworkConnectionRef.current = needsUpworkConnection;
  }, [needsUpworkConnection]);

  /** Navigating to a disabled filter would only bounce straight back to /filters. */
  const switchableFilters = useMemo(
    () => allFilters.filter((f) => f.is_enabled !== false),
    [allFilters],
  );
  const {
    jobAlertsEnabled,
    jobAlertsEnabledRef,
    handleJobAlertsChange,
    processNewJobsAfterFetch,
    markJobsSeen,
    resetJobTracker,
  } = useJobAlerts({
    filterStorageKey: id,
    notificationTargetPath: `/filter/${id}`,
    needsUpworkConnection,
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
        setUpworkOauthReady(!!data.upwork_oauth_ready);
        if (!data.upwork_connected) setNeedsUpworkConnection(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnectUpwork = useCallback(async () => {
    setConnectingUpwork(true);
    try {
      await redirectToUpworkOAuth();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to connect to Upwork.",
      );
      setConnectingUpwork(false);
    }
  }, []);

  const fetchFilter = useCallback(async () => {
    try {
      const res = await apiFetch("/api/filters");
      if (res.ok) {
        const data = await res.json();
        const filters = data.filters || [];
        setAllFilters(filters);
        const found = filters.find((f: SavedJobFilter) => f.id === id);
        if (found) {
          // A disabled filter is not accessible. Bounce before any state is
          // applied so the page never renders its criteria or job list.
          if (found.is_enabled === false) {
            toast.error(
              "This filter is disabled. Enable it on the Filters page to open it.",
            );
            router.replace("/filters");
            return;
          }
          const merged = mergeWithDefaults(
            found.filters as Record<string, unknown>,
          );
          setName(found.name);
          setNameDraft(found.name);
          setCriteria(merged);
          setSavedCriteria(merged);
          setAutoRefreshEnabled(found.auto_refresh_jobs_enabled ?? false);
          const savedQualify = found.qualify_criteria ?? "";
          setQualifyCriteria(savedQualify);
          setSavedQualifyCriteria(savedQualify);
          setQualifyEnabled(found.qualify_enabled ?? false);
        } else {
          toast.error("Filter not found");
          router.replace("/filters");
        }
      }
    } catch {
      toast.error("Failed to load filter");
      router.replace("/filters");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  const fetchAllFilters = useCallback(async () => {
    try {
      const res = await apiFetch("/api/filters");
      if (res.ok) {
        const data = await res.json();
        setAllFilters(data.filters || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Resetting to the loading state when the route id changes is a pure
  // derivation of `id`, so it happens during render rather than as a
  // synchronous setState inside the effect below.
  const [syncedId, setSyncedId] = useState(id);
  if (syncedId !== id) {
    setSyncedId(id);
    setLoading(true);
  }

  useEffect(() => {
    void (async () => {
      await Promise.all([fetchFilter(), fetchAllFilters()]);
    })();
  }, [id, fetchFilter, fetchAllFilters]);

  const handleSyncJobs = useCallback(
    async (options?: {
      silent?: boolean;
      refresh?: boolean;
    }): Promise<{ cooldownActive: boolean; capacityReached: boolean }> => {
      const silent = options?.silent === true;
      if (silent) {
        setSilentJobsRefresh(true);
      } else {
        setJobsLoading(true);
      }
      try {
        // `refresh` is sent only by "Save Changes"; opening the page never
        // triggers an Upwork fetch in shared mode.
        const body: { filterId: string; refresh?: boolean } = { filterId: id };
        if (options?.refresh) body.refresh = true;
        const res = await apiFetch("/api/jobs/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        console.log("sync jobs", data);
        if (res.ok && Array.isArray(data.jobs)) {
          setNeedsUpworkConnection(false);
          const sorted = data.jobs
            .map(mapUpworkJobToDisplayJob)
            .sort(
              (a: Job, b: Job) =>
                postedAtMsForSort(b.posted_at) - postedAtMsForSort(a.posted_at),
            );
          setJobs(sorted);
          setLoadMoreCursor(
            data.hasNextPage ? (data.cursors ?? data.endCursor ?? null) : null,
          );
          // A criteria save produces a different result set, not a batch of
          // arrivals. The re-baseline happens here, against this response,
          // rather than before the request: an auto-refresh poll for the old
          // criteria can be in flight when the save fires, and resetting up
          // front would let that stale response establish the baseline instead
          // of this one.
          if (options?.refresh) {
            resetJobTracker();
            resetJobHighlights();
          }
          const arrivals = processNewJobsAfterFetch(
            sorted.map((j: Job) => ({ id: j.id, title: j.title })),
          );
          markJobArrivals(arrivals.map((j) => j.id));
        } else {
          setJobs([]);
          setLoadMoreCursor(null);
          if (isUpworkConnectionError(data.error)) {
            setNeedsUpworkConnection(true);
          } else if (data.error && !silent) {
            // The mount-time sync races fetchFilter, so opening a disabled
            // filter's URL always lands here while the page is already
            // redirecting to /filters. Expected, not worth a toast or Sentry.
            if (data.code === FILTER_DISABLED_CODE) {
              return { cooldownActive: false, capacityReached: false };
            }
            toast.error(data.error);
          }
        }
        return {
          cooldownActive: data?.cooldownActive === true,
          capacityReached: false,
        };
      } catch (error) {
        console.error(error);
        if (!silent) toast.error("Failed to sync jobs.");
        setJobs([]);
        setLoadMoreCursor(null);
        return { cooldownActive: false, capacityReached: false };
      } finally {
        if (silent) {
          setSilentJobsRefresh(false);
        } else {
          setJobsLoading(false);
        }
      }
    },
    [
      id,
      processNewJobsAfterFetch,
      markJobArrivals,
      resetJobTracker,
      resetJobHighlights,
    ],
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!needsUpworkConnectionRef.current) return;
      void (async () => {
        try {
          const res = await apiFetch("/api/settings");
          if (!res.ok) return;
          const data = await res.json();
          setUpworkOauthReady(!!data.upwork_oauth_ready);
          if (data.upwork_connected) {
            setNeedsUpworkConnection(false);
            await handleSyncJobs({ silent: false });
          }
        } catch {
          /* ignore */
        }
      })();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [handleSyncJobs]);

  const handleLoadMore = useCallback(async () => {
    if (!loadMoreCursor || loadMoreLoading) return;
    setLoadMoreLoading(true);
    try {
      const body: {
        filterId: string;
        cursor?: string;
        cursors?: Record<string, string | null>;
      } = {
        filterId: id,
      };
      if (typeof loadMoreCursor === "string") {
        body.cursor = loadMoreCursor;
      } else if (loadMoreCursor && typeof loadMoreCursor === "object") {
        body.cursors = loadMoreCursor;
      }
      const res = await apiFetch("/api/jobs/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.jobs)) {
        const sorted = data.jobs
          .map(mapUpworkJobToDisplayJob)
          .sort(
            (a: Job, b: Job) =>
              postedAtMsForSort(b.posted_at) - postedAtMsForSort(a.posted_at),
          );
        setJobs((prev) => {
          const merged = [...prev, ...sorted];
          queueMicrotask(() =>
            markJobsSeen(
              merged.map((j: Job) => ({ id: j.id, title: j.title })),
            ),
          );
          return merged;
        });
        setLoadMoreCursor(
          data.hasNextPage ? (data.cursors ?? data.endCursor ?? null) : null,
        );
      } else {
        setLoadMoreCursor(null);
        if (isUpworkConnectionError(data.error)) {
          setNeedsUpworkConnection(true);
        } else if (data.error) {
          toast.error(data.error);
        }
      }
    } catch (err) {
      console.error("[Filter page] Load more error:", err);
      toast.error("Failed to load more jobs.");
      setLoadMoreCursor(null);
    } finally {
      setLoadMoreLoading(false);
    }
  }, [id, loadMoreCursor, loadMoreLoading, markJobsSeen]);

  useEffect(() => {
    void (async () => {
      await handleSyncJobs();
    })();
  }, [handleSyncJobs]);

  const runAutoRefreshPoll = useCallback(async () => {
    if (autoRefreshPollInFlightRef.current) return;
    if (needsUpworkConnectionRef.current) return;
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden" &&
      !jobAlertsEnabledRef.current
    ) {
      return;
    }
    autoRefreshPollInFlightRef.current = true;
    try {
      await handleSyncJobs({ silent: true });
    } finally {
      autoRefreshPollInFlightRef.current = false;
    }
  }, [handleSyncJobs]);

  useEffect(() => {
    if (!autoRefreshEnabled && !jobAlertsEnabled) return;
    const id = window.setInterval(() => {
      void runAutoRefreshPoll();
    }, AUTO_REFRESH_JOBS_POLL_MS);
    return () => window.clearInterval(id);
  }, [
    autoRefreshEnabled,
    jobAlertsEnabled,
    runAutoRefreshPoll,
  ]);

  const handleAutoRefreshChange = useCallback(
    async (next: boolean) => {
      const prev = autoRefreshEnabled;
      setAutoRefreshEnabled(next);
      try {
        const res = await apiFetch(`/api/filters/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auto_refresh_jobs_enabled: next }),
        });
        if (!res.ok) {
          setAutoRefreshEnabled(prev);
          const err = await res.json().catch(() => ({}));
          toast.error(
            typeof err.error === "string"
              ? err.error
              : "Failed to save preference",
          );
          return;
        }
      } catch {
        setAutoRefreshEnabled(prev);
        toast.error("Failed to save preference");
      }
    },
    [autoRefreshEnabled, id],
  );

  const saveFilter = useCallback(
    async (
      updates: { name?: string; filters?: FilterCriteria },
      opts?: { suppressToast?: boolean },
    ) => {
      const res = await apiFetch(`/api/filters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        // Callers that follow up with their own contextual toast (e.g. Save
        // Changes) suppress this one.
        if (!opts?.suppressToast) toast.success("Filter saved");
        return true;
      }
      const err = await res.json();
      toast.error(err.error || "Failed to save filter");
      return false;
    },
    [id],
  );

  /**
   * Commits the inline name field (Enter or blur). Unchanged and blank drafts
   * resolve without a request, so the common case of tabbing through the field
   * is silent; see resolveNameCommit for the rules.
   */
  const commitName = useCallback(async () => {
    if (nameSaving) return;
    const commit = resolveNameCommit(nameDraft, name);
    if (commit.action !== "save") {
      setNameDraft(commit.name);
      return;
    }
    setNameSaving(true);
    try {
      const ok = await saveFilter({ name: commit.name });
      if (ok) {
        setName(commit.name);
        setNameDraft(commit.name);
        // The filter switcher directly above renders `allFilters`, so it keeps
        // showing the old name until this row is patched.
        setAllFilters((prev) =>
          prev.map((f) => (f.id === id ? { ...f, name: commit.name } : f)),
        );
      } else {
        setNameDraft(name);
      }
    } finally {
      setNameSaving(false);
    }
  }, [id, name, nameDraft, nameSaving, saveFilter]);

  /** True whenever the working criteria differ from what's persisted; drives the Save button + unsaved-changes guards. */
  const isDirty = useMemo(
    () => JSON.stringify(criteria) !== JSON.stringify(savedCriteria),
    [criteria, savedCriteria],
  );

  const handleSaveChanges = useCallback(async () => {
    setSaving(true);
    try {
      const ok = await saveFilter(
        { filters: criteria },
        { suppressToast: true },
      );
      if (ok) {
        setSavedCriteria(criteria);
        // Save Changes is the only action that may fetch shared jobs, and only
        // if the cooldown has expired. Silent so the list doesn't blank out.
        const result = await handleSyncJobs({ silent: true, refresh: true });
        if (result.cooldownActive) {
          toast.success(
            "Filter changes saved. New jobs will be fetched after the remaining cooldown period.",
          );
        } else if (!result.capacityReached) {
          toast.success("Filter saved");
        }
        // On capacity-reached, handleSyncJobs already surfaced the error toast.
      }
    } finally {
      setSaving(false);
    }
  }, [criteria, saveFilter, handleSyncJobs]);

  /** True whenever the working qualify criteria differ from what's persisted. */
  const qualifyDirty = useMemo(
    () => qualifyCriteria.trim() !== savedQualifyCriteria.trim(),
    [qualifyCriteria, savedQualifyCriteria],
  );

  /** Either editor having unsaved work must block navigation away from the page. */
  const anyDirty = isDirty || qualifyDirty;

  const confirmDiscardIfDirty = useCallback(() => {
    if (!anyDirty) return true;
    return window.confirm("You have unsaved changes. Leave without saving?");
  }, [anyDirty]);

  /** Guards Link/anchor clicks that navigate away from the page while filter edits are unsaved. */
  const handleGuardedNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!anyDirty) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }
      if (!confirmDiscardIfDirty()) {
        e.preventDefault();
      }
    },
    [anyDirty, confirmDiscardIfDirty],
  );

  // Warn on tab close/refresh while there are unsaved filter or qualify edits.
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  /**
   * Persists the qualify criteria on its own. Deliberately does NOT call
   * handleSyncJobs. Unlike Save changes, editing a prompt must not spend an
   * Upwork API call (which is cooldown-gated in shared mode).
   */
  const handleSaveQualifyCriteria = useCallback(async () => {
    const trimmed = qualifyCriteria.trim();
    if (trimmed.length > QUALIFY_CRITERIA_MAX_LENGTH) {
      toast.error(
        `Criteria must be ${QUALIFY_CRITERIA_MAX_LENGTH} characters or fewer.`,
      );
      return;
    }
    setQualifySaving(true);
    try {
      // First save switches the feature on, so the badges appear immediately
      // instead of the user having to find the status dropdown.
      const wasUnset = savedQualifyCriteria.trim().length === 0;
      const body: { qualify_criteria: string; qualify_enabled?: boolean } = {
        qualify_criteria: trimmed,
      };
      if (wasUnset && trimmed) body.qualify_enabled = true;

      const res = await apiFetch(`/api/filters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(
          typeof err.error === "string"
            ? err.error
            : "Failed to save qualify criteria",
        );
        return;
      }
      setQualifyCriteria(trimmed);
      setSavedQualifyCriteria(trimmed);
      setCriteriaUndo(null);
      if (body.qualify_enabled) setQualifyEnabled(true);
      toast.success("Qualify criteria saved");
    } catch {
      toast.error("Failed to save qualify criteria");
    } finally {
      setQualifySaving(false);
    }
  }, [id, qualifyCriteria, savedQualifyCriteria]);

  /** Status writes immediately; it does not wait for Save criteria. */
  const handleQualifyEnabledChange = useCallback(
    async (next: boolean) => {
      const prev = qualifyEnabled;
      if (prev === next) return;
      setQualifyEnabled(next);
      try {
        const res = await apiFetch(`/api/filters/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qualify_enabled: next }),
        });
        if (!res.ok) {
          setQualifyEnabled(prev);
          const err = await res.json().catch(() => ({}));
          toast.error(
            typeof err.error === "string" ? err.error : "Failed to save status",
          );
          return;
        }
      } catch {
        setQualifyEnabled(prev);
        toast.error("Failed to save status");
      }
    },
    [id, qualifyEnabled],
  );

  /**
   * Rewrites the criteria in place. The result is deliberately NOT persisted.
   * The user reviews it and presses Save criteria, or undoes it.
   */
  const handleEnhanceQualifyCriteria = useCallback(async () => {
    const original = qualifyCriteria.trim();
    if (!original || qualifyEnhancing) return;
    setQualifyEnhancing(true);
    try {
      const res = await apiFetch("/api/ai/qualify-criteria/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria: original }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "INSUFFICIENT_CREDITS") {
          toast.error("Not enough credits to enhance.", {
            action: {
              label: "Add credits",
              onClick: () => router.push("/billing"),
            },
          });
        } else {
          toast.error(
            typeof data.error === "string"
              ? data.error
              : "Failed to enhance criteria",
          );
        }
        return;
      }
      if (typeof data.enhanced !== "string" || !data.enhanced.trim()) {
        toast.error("Failed to enhance criteria");
        return;
      }
      setCriteriaUndo({ text: original, label: "Undo enhance" });
      setQualifyCriteria(data.enhanced);
      toast.success("Criteria enhanced. Review it, then save.");
    } catch {
      toast.error("Failed to enhance criteria");
    } finally {
      setQualifyEnhancing(false);
    }
  }, [qualifyCriteria, qualifyEnhancing, router]);

  const handleUndoCriteriaChange = useCallback(() => {
    if (criteriaUndo === null) return;
    setQualifyCriteria(criteriaUndo.text);
    setCriteriaUndo(null);
  }, [criteriaUndo]);

  /**
   * Drops in one of the canned examples. Free and local: no request, no credits.
   * Only snapshots for undo when there was something to lose, so an example
   * picked into an empty field doesn't offer to restore nothing.
   */
  const handleApplyCriteriaExample = useCallback(
    (text: string) => {
      setCriteriaUndo(
        qualifyCriteria.trim()
          ? { text: qualifyCriteria, label: "Undo example" }
          : null,
      );
      setQualifyCriteria(text);
      toast.success("Example applied. Edit it to match your work, then save.");
    },
    [qualifyCriteria],
  );

  /**
   * sessionStorage key for verdicts. It embeds a hash of the saved criteria, so
   * editing them mints a new key and stale verdicts are never shown, with no
   * explicit invalidation needed anywhere.
   */
  const qualifyStorageKey = useMemo(
    () => qualifyCacheKey(id, savedQualifyCriteria),
    [id, savedQualifyCriteria],
  );

  /** Badges are inert unless criteria exist and the feature is switched on. */
  const qualifyActive =
    qualifyEnabled && savedQualifyCriteria.trim().length > 0;

  /**
   * Qualify gets its own fixed column so badges align down the list. Without it
   * the badge trails the title, and since `truncate` only shrinks on overflow,
   * short titles leave it at a different x on every row. The column is dropped
   * entirely when the feature is off, rather than left as dead space.
   */
  const rowGridClass = qualifyActive
    ? "grid-cols-[1fr_130px_90px_100px_110px_140px]"
    : "grid-cols-[1fr_90px_100px_110px_140px]";

  /**
   * Rehydrate verdicts for the current criteria; clear them when the key
   * changes. Derived during render rather than in an effect: reading
   * sessionStorage is synchronous, and a setState in an effect body would show
   * the previous filter's verdicts for a frame before replacing them, exactly
   * the stale-verdict problem the cache key exists to prevent.
   */
  const [syncedQualifyKey, setSyncedQualifyKey] = useState<string | null>(null);
  if (syncedQualifyKey !== qualifyStorageKey) {
    setSyncedQualifyKey(qualifyStorageKey);
    if (typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem(qualifyStorageKey);
        setQualifyResults(raw ? JSON.parse(raw) : {});
      } catch {
        setQualifyResults({});
      }
    }
  }

  /** Only settled verdicts are cached, never `loading`, which would survive a reload. */
  const cacheQualifyResults = useCallback(
    (next: Record<string, QualifyBadgeState>) => {
      if (typeof window === "undefined") return;
      const settled = Object.fromEntries(
        Object.entries(next).filter(([, v]) => v.status === "done"),
      );
      try {
        window.sessionStorage.setItem(
          qualifyStorageKey,
          JSON.stringify(settled),
        );
      } catch {
        /* quota or private mode: the in-memory map still works */
      }
    },
    [qualifyStorageKey],
  );

  const handleQualifyJob = useCallback(
    async (job: Job) => {
      if (!qualifyActive) return;
      if (qualifyResults[job.id]?.status === "loading") return;

      setQualifyResults((prev) => ({
        ...prev,
        [job.id]: { status: "loading" },
      }));

      const settle = (state: QualifyBadgeState) =>
        setQualifyResults((prev) => {
          const next = { ...prev, [job.id]: state };
          cacheQualifyResults(next);
          return next;
        });

      try {
        const res = await apiFetch("/api/jobs/qualify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filterId: id,
            job: {
              id: job.id,
              title: job.title,
              description: job.description,
              skills: job.skills,
              budget_min: job.budget_min,
              budget_max: job.budget_max,
              hourly_rate_min: job.hourly_rate_min,
              hourly_rate_max: job.hourly_rate_max,
              experience_level: job.experience_level,
              duration: job.duration,
              workload: job.workload,
              category: job.category,
              subcategory: job.subcategory,
              // Sent as text: the model can't derive age from a timestamp
              // without knowing the current time.
              posted_age: formatPostedAge(job.posted_at),
              total_applicants: job.total_applicants,
              client_country: job.client_country,
              client_total_spent: job.client_total_spent,
              client_total_reviews: job.client_total_reviews,
              client_avg_rating: job.client_avg_rating,
              client_total_hires: job.client_total_hires,
              client_total_posted_jobs: job.client_total_posted_jobs,
              client_payment_verified: job.client_payment_verified,
            },
          }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (data.code === "INSUFFICIENT_CREDITS") {
            toast.error("Not enough credits to qualify this job.", {
              action: {
                label: "Add credits",
                onClick: () => router.push("/billing"),
              },
            });
          } else {
            toast.error(
              typeof data.error === "string"
                ? data.error
                : "Failed to qualify this job",
            );
          }
          settle({ status: "error" });
          return;
        }

        if (data.verdict !== "qualified" && data.verdict !== "disqualified") {
          settle({ status: "error" });
          return;
        }

        settle({
          status: "done",
          verdict: data.verdict,
          reason: typeof data.reason === "string" ? data.reason : "",
          unverifiable: Array.isArray(data.unverifiable)
            ? data.unverifiable.filter((v: unknown) => typeof v === "string")
            : [],
        });
      } catch {
        toast.error("Failed to qualify this job");
        settle({ status: "error" });
      }
    },
    [id, qualifyActive, qualifyResults, cacheQualifyResults, router],
  );

  /** Leaving Qualify mode discards unsaved criteria, after confirming. */
  const handleExitQualifyMode = useCallback(() => {
    if (
      qualifyDirty &&
      !window.confirm("You have unsaved qualify criteria. Discard them?")
    ) {
      return;
    }
    setQualifyCriteria(savedQualifyCriteria);
    setCriteriaUndo(null);
    setSidebarMode("filters");
  }, [qualifyDirty, savedQualifyCriteria]);

  const updateCriteria = useCallback(
    (path: string, value: unknown) => {
      const parts = path.split(".");
      const next = JSON.parse(JSON.stringify(criteria)) as FilterCriteria;
      let curr = next as unknown as Record<string, unknown>;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!(key in curr)) (curr as Record<string, unknown>)[key] = {};
        curr = (curr as Record<string, unknown>)[key] as Record<
          string,
          unknown
        >;
      }
      (curr as Record<string, unknown>)[parts[parts.length - 1]] = value;
      setCriteria(next);
    },
    [criteria],
  );

  const toggleSection = (key: string) => {
    const container = scrollContainerRef.current;
    if (container) {
      pendingScrollRestoreRef.current = container.scrollTop;
    }
    setExpandedSections((s) => ({ ...s, [key]: !s[key] }));
  };

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const scrollTop = pendingScrollRestoreRef.current;
    if (container && scrollTop !== null) {
      pendingScrollRestoreRef.current = null;
      container.scrollTop = scrollTop;
    }
  }, [expandedSections]);

  const hasActiveKeywords =
    (criteria.keywords?.terms?.length ?? 0) > 0 ||
    (criteria.keywords?.exclude_terms?.length ?? 0) > 0;
  // Include keywords are capped; exclude keywords are not. A filter saved before
  // the cap can read over the limit here — that is shown, not silently trimmed,
  // and the input stays closed until the user removes enough to get back under.
  const includeTerms = criteria.keywords?.terms ?? [];
  const atKeywordLimit = includeTerms.length >= MAX_FILTER_KEYWORD_TERMS;
  // `allFilters` is the unfiltered list, disabled rows included, so it matches
  // the row count the API caps on. The server still decides; this only saves a
  // round trip to be told no.
  const atFilterCap = atFilterLimit(allFilters.length);
  const hasActiveClientDetails =
    criteria.client_details &&
    (criteria.client_details.payment_verified ||
      criteria.client_details.enterprise_client ||
      (criteria.client_details.total_spend_min ?? 0) > 0 ||
      (criteria.client_details.hires_min ?? 0) > 0 ||
      (criteria.client_details.hire_rate_min ?? 0) > 0);
  const hasActiveCountryFilter =
    (criteria.client_details?.include_countries?.length ?? 0) > 0 ||
    (criteria.client_details?.exclude_countries?.length ?? 0) > 0;
  /** The slider needs a concrete tuple; stored criteria may carry nulls. */
  const applicantRange: [number, number] = [
    criteria.job_terms?.applicants?.min ?? APPLICANTS_RANGE_MIN,
    criteria.job_terms?.applicants?.max ?? APPLICANTS_RANGE_MAX,
  ];

  // ── Client-side post-filtering ──
  // Most filters are applied at the Upwork API level via buildUpworkFilter.
  // Only filters NOT supported by the API are applied here:
  //   - total_spend_min, rating_min, reviews_count_min (no API fields)
  //   - hide_without_budget (no API field)
  //   - avoid_locations (API only has locations_any for include, not exclude)
  //   - include_without_history (no API field)
  //   - project_length (durationV3_in not available in API)
  //   - experience_level when multiple selected (API accepts single value only)
  //   - hours_per_week (API workload_eq may not match; Upwork returns "Less than 30 hrs/week", "30+ hrs/week")
  //   - include_countries / exclude_countries (client-side canonical matching)
  //
  // hire_rate_min is deliberately absent: it has no Upwork API field either, but
  // /api/jobs/sync applies it server-side via applyHireRateFilter, so the jobs
  // that arrive here are already narrowed. Editing the input therefore only
  // takes effect after Save Changes refetches.
  const filteredJobs = useMemo(() => {
    const cd = criteria.client_details;
    const jt = criteria.job_terms;
    const ajp = criteria.advanced_job_preferences;
    const fl = criteria.freelancer_location;

    const needsClientFilter =
      cd &&
      ((cd.total_spend_min ?? 0) > 0 ||
        (cd.rating_min ?? 0) > 0 ||
        (cd.reviews_count_min ?? 0) > 0 ||
        !cd.include_without_history ||
        cd.avoid_locations.length > 0);
    const needsBudgetFilter = jt?.hide_without_budget;
    const needsCountryFilter =
      (cd?.include_countries?.length ?? 0) > 0 ||
      (cd?.exclude_countries?.length ?? 0) > 0;

    const projectLengths = ajp?.project_length ?? [];
    const expLevels = ajp?.experience_level ?? [];
    const hoursPerWeek = ajp?.hours_per_week ?? [];
    const needsProjectLengthFilter = projectLengths.length > 0;
    const needsExpLevelFilter = expLevels.length > 1; // API handles single; multi needs client-side
    const needsHoursFilter = hoursPerWeek.length >= 1; // Client-side; Upwork returns "Less than 30 hrs/week", "30+ hrs/week"
    const needsAdvancedFilter =
      needsProjectLengthFilter || needsExpLevelFilter || needsHoursFilter;

    // preferredFreelancerLocation has no API-side filter (locations_any is the
    // *client's* location), so US/Europe rules are applied here.
    const needsFreelancerLocationFilter = hasActiveFreelancerLocationFilter(fl);

    // Applicant count is filtered by Upwork via `proposalRange_eq`, so there is
    // deliberately no client-side pass for it here.

    if (
      !needsClientFilter &&
      !needsBudgetFilter &&
      !needsAdvancedFilter &&
      !needsCountryFilter &&
      !needsFreelancerLocationFilter
    )
      return jobs;

    return jobs.filter((job) => {
      if (
        needsFreelancerLocationFilter &&
        !jobMatchesFreelancerLocationFilters(
          job.preferred_freelancer_locations,
          fl,
        )
      ) {
        return false;
      }


      // Hide without budget
      if (needsBudgetFilter) {
        const hasBudget =
          job.hourly_rate_min != null ||
          job.hourly_rate_max != null ||
          job.budget_min != null ||
          job.budget_max != null;
        if (!hasBudget) return false;
      }

      if (cd && needsClientFilter) {
        const hasHistory =
          job.client_total_spent != null ||
          job.client_total_hires != null ||
          job.client_total_reviews != null;

        if (!cd.include_without_history && !hasHistory) return false;

        if (hasHistory) {
          if (
            cd.total_spend_min > 0 &&
            (job.client_total_spent ?? 0) < cd.total_spend_min
          )
            return false;
          if (cd.rating_min > 0 && (job.client_avg_rating ?? 0) < cd.rating_min)
            return false;
          if (
            cd.reviews_count_min > 0 &&
            (job.client_total_reviews ?? 0) < cd.reviews_count_min
          )
            return false;
        }

        // Avoid locations (API only supports preferred/include, not exclude)
        if (cd.avoid_locations.length > 0 && job.client_country) {
          if (
            cd.avoid_locations.some((loc) =>
              job.client_country?.toLowerCase().includes(loc.toLowerCase()),
            )
          )
            return false;
        }
      }

      if (needsCountryFilter) {
        if (
          !jobMatchesCountryFilters(
            job.client_country,
            cd?.include_countries ?? [],
            cd?.exclude_countries ?? [],
          )
        )
          return false;
      }

      // Advanced job preferences (client-side; API doesn't support or only single value)
      if (needsAdvancedFilter) {
        if (needsProjectLengthFilter) {
          const jobProjectLength = parseDurationToProjectLength(job.duration);
          // Include if job matches any selected project length, or if duration unknown (include by default)
          if (jobProjectLength && !projectLengths.includes(jobProjectLength))
            return false;
        }
        if (needsExpLevelFilter) {
          const jobExp = normalizeExperienceLevel(job.experience_level);
          if (jobExp && !expLevels.includes(jobExp)) return false;
        }
        if (needsHoursFilter) {
          const w = (job.workload ?? "").toLowerCase();
          // Match Upwork's exact engagement strings: "Less than 30 hrs/week", "30+ hrs/week", "Not sure"
          const isPartTime =
            w.includes("less than 30 hrs/week") || w.includes("not sure");
          const isFullTime = w.includes("30+ hrs/week");
          if (!isPartTime && !isFullTime) return false; // Unknown workload: exclude when filter is active
          const wantsPartTime = hoursPerWeek.includes("less_than_30");
          const wantsFullTime = hoursPerWeek.includes("more_than_30");
          if (wantsPartTime && wantsFullTime) return true; // Both: include all
          if (wantsPartTime && !isPartTime) return false;
          if (wantsFullTime && !isFullTime) return false;
        }
      }

      return true;
    });
  }, [jobs, criteria]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-10 bg-black/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* Left sidebar - ~20% */}
        <aside
          className={cn(
            "flex shrink-0 flex-col overflow-y-auto border-r bg-[#f5f5f5]",
            "absolute inset-y-0 left-0 z-20 shadow-xl lg:relative lg:z-auto lg:shadow-none",
            "transition-[width] duration-200 ease-in-out",
            // Qualify mode needs room for a long prompt; the vw cap keeps the
            // drawer from swallowing the screen on small phones.
            sidebarMode === "qualify" ? "w-[min(90vw,420px)]" : "w-[280px]",
            sidebarOpen ? "flex" : "hidden lg:flex",
          )}
        >
          {sidebarMode === "qualify" ? (
            <QualifyCriteriaPanel
              criteria={qualifyCriteria}
              onCriteriaChange={setQualifyCriteria}
              enabled={qualifyEnabled}
              onEnabledChange={(v) => void handleQualifyEnabledChange(v)}
              hasSavedCriteria={savedQualifyCriteria.trim().length > 0}
              dirty={qualifyDirty}
              saving={qualifySaving}
              onSave={() => void handleSaveQualifyCriteria()}
              onBack={handleExitQualifyMode}
              onCloseMobile={() => setSidebarOpen(false)}
              onEnhance={() => void handleEnhanceQualifyCriteria()}
              enhancing={qualifyEnhancing}
              onApplyExample={handleApplyCriteriaExample}
              onUndo={criteriaUndo ? handleUndoCriteriaChange : undefined}
              undoLabel={criteriaUndo?.label}
            />
          ) : (
            <>
              <div className="sticky top-0 z-10 border-b p-3">
                <div className="flex items-center justify-between mb-2 lg:hidden">
                  <span className="text-sm font-bold">Filters</span>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="rounded p-1 hover:bg-muted/50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <Link
                  href="/filters"
                  onClick={handleGuardedNavClick}
                  className="-ml-1 mb-3 mt-3 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground border px-2 py-2 rounded-md"
                >
                  <ChevronLeft className="h-4 w-4" />

                  <span className="text-[#5a6062] uppercase font-semibold">
                    Back to filters
                  </span>
                </Link>
                <div className="flex flex-col gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title="Choose a saved filter or create a new one"
                        className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-primary/15 bg-primary px-4 text-left text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card cursor-pointer"
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <span className="truncate text-base text-[#525a00] font-bold">
                            Filters
                          </span>
                        </span>
                        <ChevronDown
                          className="h-4 w-4 shrink-0 opacity-90 text-[#525a00]"
                          aria-hidden
                        />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                        <button
                          type="button"
                          disabled={creatingFilter || atFilterCap}
                          title={
                            atFilterCap
                              ? `You have reached the limit of ${MAX_FILTERS_PER_USER} filters. Delete one to add another.`
                              : undefined
                          }
                          onClick={() => {
                            if (!confirmDiscardIfDirty()) return;
                            void createFilter();
                          }}
                          className="flex items-center justify-center gap-2 w-full mb-2 h-8 rounded-md px-3 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-70"
                        >
                          {creatingFilter ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          {atFilterCap
                            ? `Limit reached (${MAX_FILTERS_PER_USER})`
                            : "Create new filter"}
                        </button>
                      <DropdownMenuSeparator />
                      {switchableFilters.map((f) => (
                        <DropdownMenuItem
                          key={f.id}
                          onClick={() => {
                            if (!confirmDiscardIfDirty()) return;
                            router.push(`/filter/${f.id}`);
                          }}
                        >
                          {f.name}
                          {f.id === id && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              current
                            </span>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="flex flex-col min-w-0">
                    <span className="shrink-0 my-2 text-[12px] font-bold uppercase tracking-wide text-[#5a6062]">
                      Active Filter
                    </span>
                    <div className="group relative flex min-h-9 min-w-0 items-center rounded-md border border-border bg-white pl-3 pr-2 shadow-xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
                      <input
                        ref={nameInputRef}
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                            return;
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            skipNameCommitRef.current = true;
                            setNameDraft(name);
                            e.currentTarget.blur();
                          }
                        }}
                        onBlur={() => {
                          if (skipNameCommitRef.current) {
                            skipNameCommitRef.current = false;
                            return;
                          }
                          void commitName();
                        }}
                        // readOnly rather than disabled: an in-flight save must not
                        // strip the focus ring or grey the text out mid-edit.
                        readOnly={nameSaving}
                        aria-label="Filter name"
                        aria-busy={nameSaving}
                        className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-sm font-medium outline-none placeholder:text-muted-foreground"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          nameInputRef.current?.focus();
                          nameInputRef.current?.select();
                        }}
                        disabled={nameSaving}
                        aria-label="Rename filter"
                        className="ml-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      >
                        {nameSaving ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div
                ref={scrollContainerRef}
                className="flex min-h-0 flex-1 flex-col overflow-y-auto"
              >
                <div className="min-h-0 flex-1">
                  <FilterSection
                    id="keywords"
                    icon={Hash}
                    title="Keywords"
                    badge={
                      (criteria.keywords?.terms?.length ?? 0) +
                      (criteria.keywords?.exclude_terms?.length ?? 0)
                    }
                    hasActive={hasActiveKeywords}
                    expandedSections={expandedSections}
                    onToggleSection={toggleSection}
                  >
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-xs">
                            Search keywords or phrases:
                          </Label>
                          <span
                            className={cn(
                              "text-[11px] tabular-nums text-muted-foreground",
                              atKeywordLimit && "font-semibold text-destructive",
                            )}
                          >
                            {includeTerms.length} / {MAX_FILTER_KEYWORD_TERMS}
                          </span>
                        </div>
                        <Input
                          disabled={atKeywordLimit}
                          maxLength={MAX_KEYWORD_LENGTH}
                          placeholder={
                            atKeywordLimit
                              ? `Remove a keyword to add another (max ${MAX_FILTER_KEYWORD_TERMS})`
                              : "Enter keyword and press Enter"
                          }
                          className="mt-1"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const current = criteria.keywords?.terms ?? [];
                              // A disabled input never fires this, but the guard
                              // is what holds if the field gains a paste or bulk
                              // path later.
                              if (current.length >= MAX_FILTER_KEYWORD_TERMS) {
                                return;
                              }
                              const val = (
                                e.target as HTMLInputElement
                              ).value.trim();
                              if (val) {
                                const terms = [...current, val];
                                updateCriteria("keywords.terms", terms);
                                (e.target as HTMLInputElement).value = "";
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(criteria.keywords?.terms ?? []).map((t, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/70 px-2 py-1 text-xs"
                          >
                            {t}
                            <button
                              type="button"
                              onClick={() => {
                                const terms = criteria.keywords!.terms.filter(
                                  (_, j) => j !== i,
                                );
                                updateCriteria("keywords.terms", terms);
                              }}
                              className="hover:text-destructive text-base"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div>
                        <Label className="mb-2 block text-xs">Search in:</Label>
                        <div className="flex gap-4">
                          {["title", "description", "skills"].map((scope) => (
                            <label
                              key={scope}
                              className="flex items-center gap-2"
                            >
                              <Checkbox
                                checked={(
                                  criteria.keywords?.search_in ?? []
                                ).includes(scope)}
                                onCheckedChange={(checked) => {
                                  const arr =
                                    criteria.keywords?.search_in ?? [];
                                  const next = checked
                                    ? [...arr, scope]
                                    : arr.filter((s) => s !== scope);
                                  updateCriteria("keywords.search_in", next);
                                }}
                              />
                              <span className="capitalize text-xs">
                                {scope}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {/* <label className="flex items-center gap-2 w-fit cursor-pointer">
                <Checkbox
                  checked={criteria.keywords?.exclude ?? false}
                  onCheckedChange={(c) =>
                    updateCriteria("keywords.exclude", !!c)
                  }
                />
                <span className="text-xs">Set exclude keywords</span>
              </label> */}
                      <label className="flex items-center gap-2 w-fit cursor-pointer">
                        <Checkbox
                          checked={criteria.keywords?.highlight ?? true}
                          onCheckedChange={(c) =>
                            updateCriteria("keywords.highlight", c !== false)
                          }
                        />
                        <span className="text-xs">Highlight keywords</span>
                      </label>
                      <div>
                        <Label className="text-xs">
                          Exclude keywords or phrases:
                        </Label>
                        <Input
                          placeholder="Terms to hide from results"
                          maxLength={MAX_KEYWORD_LENGTH}
                          className="mt-1"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const val = (
                                e.target as HTMLInputElement
                              ).value.trim();
                              if (val) {
                                const terms = [
                                  ...(criteria.keywords?.exclude_terms ?? []),
                                  val,
                                ];
                                updateCriteria("keywords.exclude_terms", terms);
                                (e.target as HTMLInputElement).value = "";
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(criteria.keywords?.exclude_terms ?? []).map(
                          (t, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive"
                            >
                              {t}
                              <button
                                type="button"
                                onClick={() => {
                                  const terms = (
                                    criteria.keywords?.exclude_terms ?? []
                                  ).filter((_, j) => j !== i);
                                  updateCriteria(
                                    "keywords.exclude_terms",
                                    terms,
                                  );
                                }}
                                className="hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ),
                        )}
                      </div>
                      <div>
                        <Label className="mb-2 block text-xs">
                          Apply exclude keywords to:
                        </Label>
                        <div className="flex gap-4">
                          {["title", "description", "skills"].map((scope) => (
                            <label
                              key={scope}
                              className="flex items-center gap-2"
                            >
                              <Checkbox
                                checked={(
                                  criteria.keywords?.exclude_search_in ?? [
                                    "title",
                                    "description",
                                    "skills",
                                  ]
                                ).includes(scope)}
                                onCheckedChange={(checked) => {
                                  const curr = criteria.keywords
                                    ?.exclude_search_in ?? [
                                    "title",
                                    "description",
                                    "skills",
                                  ];
                                  const next = checked
                                    ? curr.includes(scope)
                                      ? curr
                                      : [...curr, scope]
                                    : curr.filter((s) => s !== scope);
                                  updateCriteria(
                                    "keywords.exclude_search_in",
                                    next,
                                  );
                                }}
                              />
                              <span className="capitalize text-xs">
                                {scope}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </FilterSection>

                  <FilterSection
                    id="job_terms"
                    icon={DollarSign}
                    title="Project terms"
                    expandedSections={expandedSections}
                    onToggleSection={toggleSection}
                  >
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 w-fit cursor-pointer">
                        <Checkbox
                          checked={
                            criteria.job_terms?.hourly_rate?.enabled ?? false
                          }
                          onCheckedChange={(c) =>
                            updateCriteria("job_terms.hourly_rate.enabled", !!c)
                          }
                        />
                        <span className="text-xs">Hourly Rate</span>
                      </label>
                      {criteria.job_terms?.hourly_rate?.enabled && (
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            placeholder="$ from"
                            value={criteria.job_terms.hourly_rate.from ?? ""}
                            onChange={(e) =>
                              updateCriteria(
                                "job_terms.hourly_rate.from",
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          />
                          <Input
                            type="number"
                            placeholder="$ to"
                            value={criteria.job_terms.hourly_rate.to ?? ""}
                            onChange={(e) =>
                              updateCriteria(
                                "job_terms.hourly_rate.to",
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          />
                          <span className="self-center text-xs">/hr</span>
                        </div>
                      )}
                      <label className="flex items-center gap-2 w-fit cursor-pointer">
                        <Checkbox
                          checked={
                            criteria.job_terms?.fixed_price?.enabled ?? false
                          }
                          onCheckedChange={(c) =>
                            updateCriteria("job_terms.fixed_price.enabled", !!c)
                          }
                        />
                        <span className="text-xs">Fixed Price</span>
                      </label>
                      {criteria.job_terms?.fixed_price?.enabled && (
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            placeholder="$ from"
                            value={criteria.job_terms.fixed_price.from ?? ""}
                            onChange={(e) =>
                              updateCriteria(
                                "job_terms.fixed_price.from",
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          />
                          <Input
                            type="number"
                            placeholder="$ to"
                            value={criteria.job_terms.fixed_price.to ?? ""}
                            onChange={(e) =>
                              updateCriteria(
                                "job_terms.fixed_price.to",
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          />
                        </div>
                      )}
                      <label className="flex items-center gap-2 w-fit cursor-pointer">
                        <Checkbox
                          checked={
                            criteria.job_terms?.hide_without_budget ?? false
                          }
                          onCheckedChange={(c) =>
                            updateCriteria("job_terms.hide_without_budget", !!c)
                          }
                        />
                        <span className="text-xs">
                          Hide projects without budget
                        </span>
                      </label>

                      {/* Applicant range (competition). Client-side only:
                          Upwork's search filter has no applicant field. */}
                      <div className="pt-1">
                        <div className="flex items-baseline justify-between">
                          <Label className="text-xs">Applicants</Label>
                          <span className="text-[11px] text-[#6C757D]">
                            {applicantRange[0]} to{" "}
                            {applicantRange[1] >= APPLICANTS_RANGE_MAX
                              ? `${APPLICANTS_RANGE_MAX}+`
                              : applicantRange[1]}
                          </span>
                        </div>
                        <Slider
                          className="mt-3"
                          min={APPLICANTS_RANGE_MIN}
                          max={APPLICANTS_RANGE_MAX}
                          step={APPLICANTS_RANGE_STEP}
                          value={applicantRange}
                          onValueChange={(next) =>
                            updateCriteria("job_terms.applicants", {
                              min: next[0] ?? APPLICANTS_RANGE_MIN,
                              max: next[1] ?? APPLICANTS_RANGE_MAX,
                            })
                          }
                          aria-label="Applicant count range"
                        />
                      </div>
                      {/* <label className="flex items-center gap-2 w-fit cursor-pointer">
                <Checkbox
                  checked={criteria.job_terms?.filter_by_lower_range ?? false}
                  onCheckedChange={(c) =>
                    updateCriteria("job_terms.filter_by_lower_range", !!c)
                  }
                />
                <span className="text-xs">Filter by lower range value</span>
              </label> */}
                      {/* <div>
                <Label className="text-xs">Required Connects:</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    type="number"
                    placeholder="min"
                    value={criteria.job_terms?.required_connects?.min ?? ""}
                    onChange={(e) =>
                      updateCriteria("job_terms.required_connects", {
                        min: e.target.value ? Number(e.target.value) : null,
                        max: criteria.job_terms?.required_connects?.max ?? null,
                      })
                    }
                  />
                  <Input
                    type="number"
                    placeholder="max"
                    value={criteria.job_terms?.required_connects?.max ?? ""}
                    onChange={(e) =>
                      updateCriteria("job_terms.required_connects", {
                        min: criteria.job_terms?.required_connects?.min ?? null,
                        max: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
              </div> */}
                    </div>
                  </FilterSection>

                  <FilterSection
                    id="client_details"
                    icon={User}
                    title="Client details"
                    hasActive={!!hasActiveClientDetails}
                    expandedSections={expandedSections}
                    onToggleSection={toggleSection}
                  >
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 w-fit cursor-pointer">
                        <Checkbox
                          checked={
                            criteria.client_details?.payment_verified ?? false
                          }
                          onCheckedChange={(c) =>
                            updateCriteria(
                              "client_details.payment_verified",
                              !!c,
                            )
                          }
                        />
                        <span className="text-xs">Payment method verified</span>
                      </label>
                      {/* Applied server-side by filter-mapper as `enterpriseOnly_eq`. */}
                      <label className="flex items-center gap-2 w-fit cursor-pointer">
                        <Checkbox
                          checked={
                            criteria.client_details?.enterprise_client ?? false
                          }
                          onCheckedChange={(c) =>
                            updateCriteria(
                              "client_details.enterprise_client",
                              !!c,
                            )
                          }
                        />
                        <span className="text-xs">
                          Upwork Enterprise Client
                        </span>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            ["total_spend_min", "Total spend, USD"],
                            ["hires_min", "Hires"],
                            // ["rating_min", "Rating"],
                            ["reviews_count_min", "Reviews count"],
                            // ["avg_hourly_rate_min", "AVG hourly rate paid"],
                            // Hire rate is a percentage, so it is the only entry
                            // here with an upper bound. Derived client-side from
                            // hires ÷ posted jobs (Upwork has no such filter).
                            ["hire_rate_min", "Hire rate, %", HIRE_RATE_MAX],
                          ] as Array<[string, string, number?]>
                        ).map(([key, label, max]) => (
                          <div key={key}>
                            <Label className="text-xs">{label}</Label>
                            <Input
                              type="number"
                              className="mt-0.5"
                              min={0}
                              max={max}
                              value={String(
                                (
                                  criteria.client_details as Record<
                                    string,
                                    unknown
                                  >
                                )?.[key] ?? 0,
                              )}
                              onChange={(e) => {
                                const next = Math.max(
                                  0,
                                  Number(e.target.value) || 0,
                                );
                                updateCriteria(
                                  `client_details.${key}`,
                                  max != null ? Math.min(max, next) : next,
                                );
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      {/* <div>
                <Label className="text-xs">Preferred Client Locations:</Label>
                <Input
                  placeholder="Start typing to search"
                  className="mt-0.5"
                />
              </div>
              <div>
                <Label className="text-xs">Avoid Clients From:</Label>
                <Input
                  placeholder="Start typing to search"
                  className="mt-0.5"
                />
              </div>
              <label className="flex items-center gap-2 w-fit cursor-pointer">
                <Checkbox
                  checked={
                    criteria.client_details?.include_without_history ?? true
                  }
                  onCheckedChange={(c) =>
                    updateCriteria(
                      "client_details.include_without_history",
                      c !== false,
                    )
                  }
                />
                <span className="text-xs">
                  Include clients without sufficient history
                </span>
              </label> */}
                    </div>
                  </FilterSection>

                  <FilterSection
                    id="client_country"
                    icon={Globe}
                    title="Client country"
                    hasActive={hasActiveCountryFilter}
                    expandedSections={expandedSections}
                    onToggleSection={toggleSection}
                  >
                    <ClientCountryFilterControls
                      includeCountries={
                        criteria.client_details?.include_countries ?? []
                      }
                      excludeCountries={
                        criteria.client_details?.exclude_countries ?? []
                      }
                      onIncludeChange={(next) =>
                        updateCriteria("client_details.include_countries", next)
                      }
                      onExcludeChange={(next) =>
                        updateCriteria("client_details.exclude_countries", next)
                      }
                    />
                  </FilterSection>

                  {/* Freelancer Location, temporarily hidden.
                      The filtering logic, its tests, and the
                      preferredFreelancerLocation query field all remain in
                      place; with the controls gone the criteria stay at
                      their "include" defaults, so the filter is a no-op.
                      Re-enable by removing this comment wrapper. */}
                  {/*
                  <FilterSection
                    id="freelancer_location"
                    icon={MapPin}
                    title="Freelancer Location"
                    hasActive={hasActiveFreelancerLocation}
                    expandedSections={expandedSections}
                    onToggleSection={toggleSection}
                  >
                    <div className="space-y-3">
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Some clients state which countries they want freelancers
                        from. These rules match against that preference.
                      </p>
                      {(
                        [
                          ["us_filter", "Jobs for freelancers in the U.S.:"],
                          ["europe_filter", "Jobs for freelancers in Europe:"],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key}>
                          <Label className="text-xs">{label}</Label>
                          <RadioGroup
                            value={
                              criteria.freelancer_location?.[key] ?? "include"
                            }
                            onValueChange={(v) =>
                              updateCriteria(
                                `freelancer_location.${key}`,
                                v as "include" | "exclude" | "only",
                              )
                            }
                          >
                            <div className="flex gap-4 mt-1">
                              {["include", "exclude", "only"].map((v) => (
                                <label
                                  key={v}
                                  className="flex items-center gap-2 cursor-pointer"
                                >
                                  <RadioGroupItem value={`${v}`} />
                                  <span className="capitalize text-xs">
                                    {v}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </RadioGroup>
                        </div>
                      ))}
                      <label className="flex items-start gap-2 w-fit cursor-pointer">
                        <Checkbox
                          className="mt-0.5"
                          checked={
                            criteria.freelancer_location
                              ?.show_without_country_preference ?? false
                          }
                          onCheckedChange={(c) =>
                            updateCriteria(
                              "freelancer_location.show_without_country_preference",
                              !!c,
                            )
                          }
                        />
                        <span className="text-xs">
                          Show projects without country preference
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            Most jobs state no preference. Without this, “only”
                            hides them.
                          </span>
                        </span>
                      </label>
                    </div>
                  </FilterSection>
                  */}

                  {/* <Section
            id="freelancer_qualifications"
            icon={Wrench}
            title="Freelancer qualifications"
          >
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Talent Type:</Label>
                <div className="mt-1 flex flex-col gap-1">
                  {["not_specified", "independent", "agency"].map((v, i) => (
                    <label key={v} className="flex items-center gap-2">
                      <Checkbox
                        checked={(
                          criteria.freelancer_qualifications?.talent_type ?? []
                        ).includes(v)}
                        onCheckedChange={(c) => {
                          const arr =
                            criteria.freelancer_qualifications?.talent_type ??
                            [];
                          const next = c
                            ? [...arr, v]
                            : arr.filter((x) => x !== v);
                          updateCriteria(
                            "freelancer_qualifications.talent_type",
                            next,
                          );
                        }}
                      />
                      <span className="text-xs capitalize">
                        {v === "not_specified"
                          ? "Not Specified"
                          : v === "independent"
                            ? "Independent only"
                            : "Agency only"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">English level:</Label>
                <div className="mt-1 flex flex-col gap-1">
                  {[
                    "not_specified",
                    "basic",
                    "conversational",
                    "fluent",
                    "native",
                  ].map((v) => (
                    <label key={v} className="flex items-center gap-2">
                      <Checkbox
                        checked={(
                          criteria.freelancer_qualifications?.english_level ??
                          []
                        ).includes(v)}
                        onCheckedChange={(c) => {
                          const arr =
                            criteria.freelancer_qualifications?.english_level ??
                            [];
                          const next = c
                            ? [...arr, v]
                            : arr.filter((x) => x !== v);
                          updateCriteria(
                            "freelancer_qualifications.english_level",
                            next,
                          );
                        }}
                      />
                      <span className="text-xs capitalize">
                        {v === "not_specified"
                          ? "Not Specified"
                          : v === "native"
                            ? "Native or Bilingual"
                            : v}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">Job Success Score:</Label>
                <RadioGroup
                  value={
                    criteria.freelancer_qualifications?.job_success_score ??
                    "any"
                  }
                  onValueChange={(v) =>
                    updateCriteria(
                      "freelancer_qualifications.job_success_score",
                      v,
                    )
                  }
                >
                  <div className="mt-1 flex flex-col gap-1">
                    {[
                      "any",
                      "80_plus",
                      "90_plus",
                      "exclude_90",
                      "exclude_80",
                    ].map((v) => (
                      <label key={v} className="flex items-center gap-2">
                        <RadioGroupItem value={v} />
                        <span className="text-xs">
                          {v === "any"
                            ? "Any"
                            : v === "80_plus"
                              ? "At least 80%"
                              : v === "90_plus"
                                ? "At least 90%"
                                : v === "exclude_90"
                                  ? "Exclude if 90%+ required"
                                  : "Exclude if 80%+ required"}
                        </span>
                      </label>
                    ))}
                  </div>
                </RadioGroup>
              </div>
              <div>
                <Label className="text-xs">
                  Preferred Language Qualifications:
                </Label>
                <Input
                  placeholder="Start typing to search"
                  className="mt-0.5"
                />
              </div>
              <div>
                <Label className="text-xs">
                  Avoid Language Qualifications:
                </Label>
                <Input
                  placeholder="Start typing to search"
                  className="mt-0.5"
                />
              </div>
            </div>
          </Section> */}

                  <FilterSection
                    id="advanced_job_preferences"
                    icon={SlidersHorizontal}
                    title="Advanced job preferences"
                    expandedSections={expandedSections}
                    onToggleSection={toggleSection}
                  >
                    <div className="space-y-3">
                      {/* <label className="flex items-center gap-2 w-fit cursor-pointer">
                <Checkbox
                  checked={
                    criteria.advanced_job_preferences?.featured_project ?? false
                  }
                  onCheckedChange={(c) =>
                    updateCriteria(
                      "advanced_job_preferences.featured_project",
                      !!c,
                    )
                  }
                />
                <span className="text-xs">Featured (Premium) Project</span>
              </label> */}
                      <div>
                        <Label className="text-xs">Experience level:</Label>
                        <div className="mt-1 flex flex-col gap-1">
                          {["entry", "intermediate", "expert"].map((v) => (
                            <label key={v} className="flex items-center gap-2">
                              <Checkbox
                                checked={(
                                  criteria.advanced_job_preferences
                                    ?.experience_level ?? []
                                ).includes(v)}
                                onCheckedChange={(c) => {
                                  const arr =
                                    criteria.advanced_job_preferences
                                      ?.experience_level ?? [];
                                  const next = c
                                    ? [...arr, v]
                                    : arr.filter((x) => x !== v);
                                  updateCriteria(
                                    "advanced_job_preferences.experience_level",
                                    next,
                                  );
                                }}
                              />
                              <span className="text-xs capitalize">
                                {v === "entry"
                                  ? "Entry level"
                                  : v === "intermediate"
                                    ? "Intermediate"
                                    : "Expert"}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Project Length:</Label>
                        <div className="mt-1 flex flex-col gap-1">
                          {[
                            "less_than_month",
                            "1_to_3_months",
                            "3_to_6_months",
                            "more_than_6_months",
                          ].map((v) => (
                            <label key={v} className="flex items-center gap-2">
                              <Checkbox
                                checked={(
                                  criteria.advanced_job_preferences
                                    ?.project_length ?? []
                                ).includes(v)}
                                onCheckedChange={(c) => {
                                  const arr =
                                    criteria.advanced_job_preferences
                                      ?.project_length ?? [];
                                  const next = c
                                    ? [...arr, v]
                                    : arr.filter((x) => x !== v);
                                  updateCriteria(
                                    "advanced_job_preferences.project_length",
                                    next,
                                  );
                                }}
                              />
                              <span className="text-xs">
                                {v === "less_than_month"
                                  ? "Less than 1 month"
                                  : v === "1_to_3_months"
                                    ? "1 to 3 months"
                                    : v === "3_to_6_months"
                                      ? "3 to 6 months"
                                      : "More than 6 months"}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {/* <div>
                <Label className="text-xs">Hours per week:</Label>
                <div className="mt-1 flex flex-col gap-1">
                  {["less_than_30", "more_than_30"].map((v) => (
                    <label key={v} className="flex items-center gap-2">
                      <Checkbox
                        checked={(
                          criteria.advanced_job_preferences?.hours_per_week ??
                          []
                        ).includes(v)}
                        onCheckedChange={(c) => {
                          const arr =
                            criteria.advanced_job_preferences?.hours_per_week ??
                            [];
                          const next = c
                            ? [...arr, v]
                            : arr.filter((x) => x !== v);
                          updateCriteria(
                            "advanced_job_preferences.hours_per_week",
                            next,
                          );
                        }}
                      />
                      <span className="text-xs">
                        {v === "less_than_30"
                          ? "Less than 30 hrs/week"
                          : "More than 30 hrs/week"}
                      </span>
                    </label>
                  ))}
                </div>
              </div> */}
                      {/* <div>
                <Label className="text-xs">Screening questions:</Label>
                <RadioGroup
                  value={
                    criteria.advanced_job_preferences?.screening_questions ??
                    "any"
                  }
                  onValueChange={(v) =>
                    updateCriteria(
                      "advanced_job_preferences.screening_questions",
                      v,
                    )
                  }
                >
                  <div className="mt-1 flex flex-col gap-1">
                    {["any", "with", "without"].map((v) => (
                      <label key={v} className="flex items-center gap-2">
                        <RadioGroupItem value={v} />
                        <span className="text-xs">
                          {v === "any"
                            ? "Any"
                            : v === "with"
                              ? "With screening questions"
                              : "Without screening questions"}
                        </span>
                      </label>
                    ))}
                  </div>
                </RadioGroup>
              </div> */}
                    </div>
                  </FilterSection>

                  {/* <Section
            id="sites_categories"
            icon={Globe}
            title="Sites & categories"
            hasActive={!!hasActiveSites}
          >
            <p className="text-xs text-muted-foreground">Coming soon</p>
          </Section>

          <Section id="advanced_filters" icon={Filter} title="Advanced Filters">
            <p className="text-xs text-muted-foreground">Coming soon</p>
          </Section> */}
                </div>
              </div>

              {/* Sticky save bar, stays visible while scrolling the filter list, and inside the mobile drawer. */}
              <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-[#f5f5f5] p-3">
                <Button
                  type="button"
                  disabled={!isDirty || saving}
                  onClick={() => void handleSaveChanges()}
                  aria-label={
                    isDirty
                      ? "Save changes: you have unsaved changes"
                      : "Save changes"
                  }
                  className={cn(
                    "relative w-full font-semibold",
                    isDirty &&
                      !saving &&
                      "shadow-[0_0_0_3px_rgba(82,90,0,0.15)] hover:shadow-[0_0_0_3px_rgba(82,90,0,0.22)]",
                  )}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save changes"
                  )}
                  {isDirty && !saving && (
                    <span
                      className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-[#f5f5f5]"
                      aria-hidden
                    />
                  )}
                </Button>
              </div>
            </>
          )}
        </aside>

        {/* Right - Jobs area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Top header bar */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-card px-3 sm:px-6 py-3">
            <div className="flex items-center gap-2 min-w-0">
              {/* Opens the dashboard nav as a Sheet on mobile; the rail is
                  always visible on desktop, so this is hidden there. */}
              <SidebarTrigger
                className="lg:hidden"
                aria-label="Open navigation menu"
              />
              <Link
                href="/filters"
                onClick={handleGuardedNavClick}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted/50 transition-colors lg:hidden"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Link>
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted/50 transition-colors lg:hidden"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </button>
              <span className="text-muted-foreground">
                {filteredJobs.length.toLocaleString()} projects
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* <Button variant="outline" size="sm" asChild>
              <Link href="/proposals/new">
                <FileText className="h-4 w-4 mr-2" />
                Set up Proposal lift
              </Link>
            </Button> */}
              {/* AI Qualify spends no Upwork quota, so unlike the two toggles
                below it stays available in shared mode. */}
              <button
                type="button"
                onClick={() => {
                  setSidebarMode("qualify");
                  setSidebarOpen(true);
                }}
                title="Describe your niche, then check individual jobs against it with AI."
                className="flex items-center gap-2.5 rounded-lg border border-border/80 bg-muted/35 px-3 py-2 shadow-xs transition-colors hover:bg-muted/60"
              >
                <Sparkles
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="text-xs font-medium text-foreground">
                  AI Qualify
                </span>
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    savedQualifyCriteria.trim().length === 0
                      ? "border border-muted-foreground/40"
                      : qualifyEnabled
                        ? "bg-[#4CAF50]"
                        : "bg-muted-foreground/40",
                  )}
                  aria-hidden
                />
              </button>
              <>
                  <div
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border border-border/80 bg-muted/35 px-3 py-2 shadow-xs",
                      needsUpworkConnection && "opacity-60",
                    )}
                    title={
                      needsUpworkConnection
                        ? "Connect Upwork in Settings to enable job alerts."
                        : "Notify with sound when new jobs match this filter. Desktop notifications when the tab is in the background (permission required)."
                    }
                  >
                    <div className="flex flex-col gap-0.5 text-right min-w-0">
                      <Label
                        htmlFor="filter-job-alerts"
                        className={cn(
                          "flex items-center justify-end gap-1.5 text-xs font-medium text-foreground",
                          needsUpworkConnection
                            ? "cursor-not-allowed"
                            : "cursor-pointer",
                        )}
                      >
                        <Bell
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        Job alerts
                      </Label>
                    </div>
                    <Switch
                      id="filter-job-alerts"
                      checked={jobAlertsEnabled}
                      onCheckedChange={(v) => void handleJobAlertsChange(v)}
                      disabled={needsUpworkConnection}
                      aria-label="Job alerts: sound and optional desktop notifications when new jobs match"
                    />
                  </div>
                  <div
                    className="flex items-center gap-2.5 rounded-lg border border-border/80 bg-muted/35 px-3 py-2 shadow-xs"
                    title="Refreshes job listings every 2 minutes while this page is open. Pauses when the tab is in the background." 
                  >
                    <div className="flex flex-col gap-0.5 text-right min-w-0">
                      <Label
                        htmlFor="filter-auto-refresh"
                        className="flex items-center justify-end gap-1.5 text-xs font-medium text-foreground cursor-pointer"
                      >
                        <RefreshCw
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 text-muted-foreground",
                            silentJobsRefresh && "animate-spin",
                          )}
                          aria-hidden
                        />
                        Auto-refresh
                      </Label>
                    </div>
                    <Switch
                      id="filter-auto-refresh"
                      checked={autoRefreshEnabled}
                      onCheckedChange={(v) => void handleAutoRefreshChange(v)}
                      aria-label="Auto-refresh job listings every 2 minutes while this page is open" 
                    />
                  </div>
              </>
              {/* <Button variant="outline" size="sm" asChild>
              <Link href="/settings">
                <Settings className="h-4 w-4 mr-2" />
                View settings
              </Link>
            </Button> */}
            </div>
          </div>

          {needsUpworkConnection ? (
            <div className="shrink-0 border-b border-amber-200/90 bg-amber-50 px-6 py-3 dark:border-amber-900/40 dark:bg-amber-950/25">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3 min-w-0">
                  <Briefcase
                    className="h-5 w-5 shrink-0 text-amber-800 dark:text-amber-400"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    {upworkOauthReady ? (
                      <>
                        <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                          Connect Upwork to load the latest jobs
                        </p>
                        <p className="text-xs text-amber-900/85 dark:text-amber-200/80 mt-0.5">
                          Authorize this app to search Upwork job postings using
                          your API credentials. Jobs matching your search terms
                          will be synced to your Job Feed.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                          Add your Upwork API credentials
                        </p>
                        <p className="text-xs text-amber-900/85 dark:text-amber-200/80 mt-0.5">
                          Enter your Upwork app Client ID and Secret in
                          Settings, then connect your account to start syncing
                          jobs.
                        </p>
                      </>
                    )}
                  </div>
                </div>
                {upworkOauthReady ? (
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 bg-green-600 hover:bg-green-700 text-white"
                    disabled={connectingUpwork}
                    onClick={() => void handleConnectUpwork()}
                  >
                    {connectingUpwork ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4 mr-2" />
                    )}
                    Connect Upwork Account
                  </Button>
                ) : (
                  <Button
                    asChild
                    size="sm"
                    className="shrink-0 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Link href="/settings?tab=integrations">
                      <Settings className="h-4 w-4 mr-2" />
                      Add API credentials
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {/* Jobs list - table with collapsible rows */}
          <div className="flex-1 overflow-y-auto mx-4 relative">
            {jobsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Filter className="h-12 w-12 mb-4" />
                <p className="text-lg font-medium">
                  {needsUpworkConnection
                    ? "Upwork is not connected"
                    : "No jobs found"}
                </p>
                <p className="text-sm mt-1 text-center max-w-md px-4">
                  {needsUpworkConnection
                    ? "Use the banner above to connect your account, then this list will fill with matching jobs from Upwork."
                    : jobs.length > 0
                      ? `${jobs.length} jobs fetched but none match your filters`
                      : "Jobs matching your filters will appear here"}
                </p>
                <Button variant="outline" className="mt-4" asChild>
                  <Link href="/jobs">View Job Feed</Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="border rounded-md overflow-hidden bg-white min-w-[640px]">
                  {/* Table header */}
                  <div
                    className={cn(
                      "grid gap-3 items-center px-3 sm:px-6 py-2 border-b border-gray-100 text-[14px] font-bold text-[#212121]",
                      rowGridClass,
                    )}
                  >
                    <div className="min-w-0 text-left">Job Title</div>
                    {qualifyActive && <div aria-hidden />}
                    {/* Right-aligned so the values sit flush against the action
                        column instead of leaving a hole mid-row. */}
                    <div className="text-right">Applicants</div>
                    <div className="text-right">Budget</div>
                    <div className="text-right">Published</div>
                    <div aria-hidden />
                  </div>
                  {/* Job rows */}
                  {filteredJobs.map((job) => {
                    const budget =
                      job.hourly_rate_min != null || job.hourly_rate_max != null
                        ? (() => {
                            const min = job.hourly_rate_min;
                            const max = job.hourly_rate_max;
                            if (min != null && max != null) {
                              return `$${min}-$${max} / hr`;
                            }
                            if (max != null) return `$${max} / hr`;
                            return `$${min} / hr`;
                          })()
                        : job.budget_min != null || job.budget_max != null
                          ? (() => {
                              const min = job.budget_min ?? 0;
                              const max = job.budget_max ?? 0;
                              if (min === max)
                                return `$${min.toLocaleString()}`;
                              return `$${min.toLocaleString()}-${max.toLocaleString()}`;
                            })()
                          : "not specified";
                    const timeAgo = formatPostedAge(job.posted_at) ?? "-";
                    const clientRank = computeClientRankScore(job);
                    const score = clientRank.score;
                    const scoreColor =
                      score === 5
                        ? "bg-[#4CAF50] text-white"
                        : score === 3
                          ? "bg-[#FF9800] text-white"
                          : score === 1
                            ? "bg-[#F44336] text-white"
                            : // Too few signals resolved to grade the client.
                              "bg-[#F1F3F5] text-[#6C757D] border border-[#DEE2E6]";
                    const skillTag =
                      job.skills?.[0] ?? job.title.split(" ")[0] ?? null;
                    const isExpanded = expandedJobId === job.id;
                    const competitionLevel = getCompetitionLevel(
                      job.total_applicants,
                    );

                    return (
                      <div
                        key={job.id}
                        className={cn(
                          "border-b border-gray-100 last:border-b-0",
                          // border-l-2 is unconditional so applying the accent
                          // colour does not shift the row 2px sideways.
                          "border-l-2 transition-colors duration-700",
                          isNewJob(job.id)
                            ? "border-l-[#2563EB] bg-[#EFF6FF]"
                            : "border-l-transparent bg-white",
                        )}
                      >
                        {/* Collapsed row content - always visible */}
                        <div
                          className={cn(
                            // `group` drives the row-hover reveal of the
                            // qualify re-check button.
                            "group grid gap-3 items-center px-3 sm:px-6 py-2 min-h-[30px] cursor-pointer hover:opacity-90",
                            rowGridClass,
                          )}
                          onClick={() =>
                            setExpandedJobId(isExpanded ? null : job.id)
                          }
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="shrink-0 text-[#6C757D]">
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </span>

                            <span className="text-[14px] text-[#666666] truncate min-w-0">
                              {criteria.keywords?.highlight &&
                              criteria.keywords?.terms?.length
                                ? highlightKeywordSegments(
                                    job.title,
                                    criteria.keywords.terms.map((t) =>
                                      typeof t === "string" ? t : String(t),
                                    ),
                                  )
                                : job.title}
                            </span>

                            {/* Upwork's own applied flag, which keeps the user from
                                re-opening a job they already bid on. */}
                            {job.already_applied && (
                              <span
                                title="You already submitted a proposal for this job on Upwork"
                                className="inline-flex shrink-0 items-center rounded-md bg-[#E3F2FD] px-2 py-0.5 text-[11px] font-bold text-[#1565C0]"
                              >
                                Applied
                              </span>
                            )}

                          </div>

                          {/* Column order must match the table header and
                              rowGridClass: qualify, then applicants. */}
                          {qualifyActive && (
                            <div className="flex items-center justify-end">
                              <QualifyBadge
                                state={
                                  qualifyResults[job.id] ?? { status: "idle" }
                                }
                                onQualify={() => void handleQualifyJob(job)}
                              />
                            </div>
                          )}
                          {/* Competition gets its own column so the counts line
                              up down the list instead of trailing each title. */}
                          <div className="flex justify-end">
                            {competitionLevel && (
                              <span
                                title={
                                  getCompetitionTooltip(job.total_applicants) ??
                                  undefined
                                }
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold",
                                  COMPETITION_BADGE_CLASS[competitionLevel],
                                )}
                              >
                                <Users
                                  className="h-3.5 w-3.5 shrink-0"
                                  strokeWidth={2.25}
                                  aria-hidden
                                />
                                {job.total_applicants}
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <span
                              className={cn(
                                budget === "not specified"
                                  ? "text-[#999999] text-[12px]"
                                  : "text-[#DC3545] text-sm font-bold",
                              )}
                            >
                              {budget}
                            </span>
                          </div>
                          <div className="text-right text-[14px] text-black">
                            {timeAgo}
                          </div>
                          {/* Actions get their own column so the rank pill and the
                          two buttons line up down the list, independent of how
                          wide the "x hours ago" text happens to be. */}
                          <div className="flex items-center justify-end gap-2">
                            <ClientRankPopover
                              job={job}
                              rank={clientRank}
                              open={openJobId === job.id}
                              onOpenChange={(v) =>
                                setOpenJobId(v ? job.id : null)
                              }
                            >
                              <ClientRankBadge
                                status={clientRank.status}
                                className={scoreColor}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </ClientRankPopover>
                            {job.ciphertext && (
                              <Link
                                href={job.ciphertext}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="Open on Upwork"
                                aria-label={`Open "${job.title}" on Upwork in a new tab`}
                                className="p-1.5 rounded border border-gray-200 bg-white text-[#666666] hover:bg-gray-50"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  onClick={(e) => e.stopPropagation()}
                                  title="More actions"
                                  aria-label={`More actions for "${job.title}"`}
                                  className="p-1.5 rounded border border-gray-200 bg-white text-[#666666] hover:bg-gray-50"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
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
                                    router.push(
                                      `/proposals/new?prefillKey=${key}`,
                                    );
                                  }}
                                >
                                  <Send className="h-4 w-4 mr-2" />
                                  Write proposal
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {/* Only rendered when Upwork actually returns a
                                title, so there is no dead icon on rows without one. */}
                            {job.client_last_contract_title && (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={(e) => e.stopPropagation()}
                                      aria-label="What this client last hired for"
                                      className="p-1.5 rounded border border-gray-200 bg-white text-[#666666] hover:bg-gray-50"
                                    >
                                      <Info className="h-4 w-4" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="left"
                                    className="max-w-[260px]"
                                  >
                                    {/* Labelled explicitly: this is the client's
                                        previous contract, not this posting. */}
                                    <span className="font-semibold">
                                      Last hired for:
                                    </span>{" "}
                                    {job.client_last_contract_title}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>

                        {/* Expanded row content */}
                        {isExpanded && (
                          <div className="px-3 sm:px-6 py-4 border-t border-gray-100 bg-white">
                            {/* Full title: the collapsed row truncates it, so
                                this is the only place the whole thing is
                                readable. Wraps rather than clipping. */}
                            <h3 className="mb-3 text-[15px] font-bold text-[#212121] leading-snug break-words">
                              {criteria.keywords?.highlight &&
                              criteria.keywords?.terms?.length
                                ? highlightKeywordSegments(
                                    job.title,
                                    criteria.keywords.terms.map((t) =>
                                      typeof t === "string" ? t : String(t),
                                    ),
                                  )
                                : job.title}
                            </h3>

                            {/* Metadata row - required_connects instead of reviews */}
                            <div className="flex flex-wrap items-center gap-4 text-sm text-[#333333] mb-4 pb-4 border-b border-[#E0E0E0]">
                              {/* <span>
                            Required Connects:{" "}
                            <span className="font-semibold">
                              {job.connects_required ?? "-"}
                            </span>
                          </span> */}
                              {job.client_total_spent != null && (
                                <span>
                                  <span className="font-medium text-sm">
                                    ${job.client_total_spent.toLocaleString()}
                                  </span>{" "}
                                  Spent
                                </span>
                              )}
                              {job.client_country && (
                                <span className="flex items-center gap-1.5">
                                  <CountryFlag
                                    country={job.client_country}
                                    width="1.125rem"
                                    height="0.84375rem"
                                  />
                                  {normalizeJobCountryToCanonical(
                                    job.client_country,
                                  ) ?? job.client_country}
                                </span>
                              )}
                            </div>

                            {/* Job description with keyword highlight */}
                            {job.description && (
                              <div className="text-sm text-black leading-relaxed mb-4">
                                {criteria.keywords?.highlight &&
                                criteria.keywords?.terms?.length ? (
                                  <div className="whitespace-pre-wrap">
                                    {highlightKeywordSegments(
                                      job.description,
                                      criteria.keywords.terms.map((t) =>
                                        typeof t === "string" ? t : String(t),
                                      ),
                                    )}
                                  </div>
                                ) : (
                                  <div className="whitespace-pre-wrap">
                                    {job.description}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Skill tags */}
                            {(job.skills?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap gap-2 mb-4">
                                {(() => {
                                  const kwTerms =
                                    criteria.keywords?.terms?.map((t) =>
                                      typeof t === "string" ? t : String(t),
                                    ) ?? [];
                                  const showHl =
                                    criteria.keywords?.highlight &&
                                    kwTerms.length > 0;
                                  return job.skills!.map((skill) => (
                                    <span
                                      key={skill}
                                      className="px-3 py-1 rounded-full text-sm text-[#000000] border border-[#D3D3D3] "
                                    >
                                      {showHl
                                        ? highlightKeywordSegments(
                                            skill,
                                            kwTerms,
                                          )
                                        : skill}
                                    </span>
                                  ));
                                })()}
                              </div>
                            )}

                            {/* Project details */}
                            <div className="flex flex-wrap items-center gap-4 text-sm text-[#333333] mb-4 pb-4 border-b border-[#E0E0E0]">
                              {job.workload && (
                                <span className="flex items-center gap-1.5">
                                  <Clock className="h-4 w-4 text-[#6C757D]" />
                                  <span className="font-semibold">
                                    {job.workload}
                                  </span>
                                </span>
                              )}
                              {job.duration && (
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="h-4 w-4 text-[#6C757D]" />
                                  <span className="font-semibold">
                                    {job.duration}
                                  </span>
                                </span>
                              )}
                              {job.experience_level && (
                                <span className="flex items-center gap-1.5">
                                  <GraduationCap className="h-4 w-4 text-[#6C757D]" />
                                  <span className="text-black font-medium">
                                    {job.experience_level}
                                  </span>
                                </span>
                              )}
                              <span className="flex items-center gap-1.5">
                                <Briefcase className="h-4 w-4 text-[#6C757D]" />
                                <span className="text-black font-medium">
                                  Complex project
                                </span>
                              </span>
                              <span className="flex items-center gap-1.5">
                                <User className="h-4 w-4 text-[#6C757D]" />
                                <span className="text-black font-medium">
                                  Client&apos;s Work History (
                                  {job.client_total_reviews ?? 0} project
                                  {(job.client_total_reviews ?? 0) !== 1
                                    ? "s"
                                    : ""}
                                  )
                                </span>
                              </span>
                            </div>

                            {/* Categories footer */}
                            {(job.category || job.subcategory) && (
                              <div className="text-sm  text-[#7c7c7c]">
                                {[job.category, job.subcategory]
                                  .filter((item): item is string =>
                                    Boolean(item),
                                  )
                                  .map((item) =>
                                    item
                                      .replace(/_/g, " ")
                                      .replace(/\b\w/g, (char) =>
                                        char.toUpperCase(),
                                      ),
                                  )
                                  .join(", ")}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {loadMoreCursor && jobs.length > 0 && (
                    <div className="flex justify-center py-6 border-t border-gray-100">
                      <Button
                        variant="outline"
                        onClick={handleLoadMore}
                        disabled={loadMoreLoading}
                        className="min-w-[140px]"
                      >
                        {loadMoreLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-2" />
                            Load More
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </>
  );
}
