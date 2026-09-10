"use client";
import { apiFetch } from "@/lib/api-fetch";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  FileText,
  FolderOpen,
  FileCode,
  Plus,
  Sparkles,
  TrendingUp,
  Send,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { CountryFlag } from "@/components/CountryFlag";
// import { useAuth } from "@/lib/auth/auth-context";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useShallow } from "zustand/react/shallow";
import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from "recharts";

interface DashboardStats {
  proposalCount: number;
  projectCount: number;
  templateCount: number;
  recentProposals: {
    id: string;
    job_title: string;
    client_name: string;
    ai_model: string | null;
    created_at: string;
    status: string;
  }[];
}

interface UpworkActivityItem {
  vendorProposalId: string;
  jobPostingId: string | null;
  jobTitle: string;
  clientLabel: string;
  /** `null` when Upwork gave only a city, in which case no flag is rendered. */
  clientCountry: string | null;
  status: string;
  activityAt: string;
  submittedAt: string;
}

interface UpworkActivityResponse {
  items: UpworkActivityItem[];
  skipped?: boolean;
  error?: string;
}

interface UpworkContextRow {
  organizationId: string;
  title: string;
  kind?: "personal" | "agency" | "unknown";
}

interface UpworkContextsResponse {
  contexts: UpworkContextRow[];
  /** Token works, but the Upwork account has no freelancer or agency profile. */
  clientOnly?: boolean;
  skipped?: boolean;
  error?: string;
}

const ACTIVITY_LIMIT = 10;

const UPWORK_CONTEXT_STORAGE_KEY = "dashboard-upwork-context";

function persistUpworkContext(id: string) {
  try {
    localStorage.setItem(UPWORK_CONTEXT_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

function upworkActivityUrl(contextId: string) {
  const params = new URLSearchParams({ context: contextId });
  return `/api/dashboard/upwork-activity?${params.toString()}`;
}

function formatUpworkContextOptionLabel(row: UpworkContextRow) {
  const title = row.title.trim() || "Organization";
  // A personal profile and an agency can share a title, so the suffix is what
  // tells them apart. No suffix when Upwork did not tell us the kind.
  if (row.kind === "personal") return `${title} (You)`;
  if (row.kind === "agency") return `${title} (Agency)`;
  return title;
}

function isOfferedVendorProposalStatus(
  status: string | null | undefined,
): boolean {
  return (status ?? "").trim().toLowerCase() === "offered";
}

function getUpworkProposalStatusBadge(status: string | null | undefined): {
  text: string;
  className: string;
} {
  const key = (status ?? "").trim().toLowerCase();

  switch (key) {
    case "accepted":
      return {
        text: "Proposal sent",
        className:
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25",
      };
    case "offered":
      return {
        text: "Client sent an offer/interview",
        className:
          "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/25",
      };
    case "hired":
      return {
        text: "Hired",
        className:
          "bg-teal-500/15 text-teal-700 dark:text-teal-400 border border-teal-500/25",
      };
    case "declined":
      return {
        text: "Client rejected proposal",
        className:
          "bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/25",
      };
    case "withdrawn":
      return {
        text: "Proposal withdrawn",
        className:
          "bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/25",
      };
    case "activated":
      return {
        text: "Conversation started",
        className:
          "bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/25",
      };
    case "archived":
      return {
        text: "Job closed",
        className:
          "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border border-zinc-500/25",
      };
    case "invalid":
      return {
        text: "Failed validation",
        className:
          "bg-amber-500/15 text-amber-800 dark:text-amber-400 border border-amber-500/30",
      };
    case "pending":
      return {
        text: "Processing",
        className:
          "bg-yellow-500/15 text-yellow-800 dark:text-yellow-400 border border-yellow-500/25",
      };
    default:
      return {
        text: status ? String(status) : "Status updated",
        className: "bg-muted text-muted-foreground border border-border/60",
      };
  }
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Recent Activity lists only Upwork vendor proposals (not saved app proposals). */
function buildUpworkActivityRows(
  upwork: UpworkActivityResponse | null,
): UpworkActivityItem[] {
  const items = [...(upwork?.items ?? [])].sort(
    (a, b) =>
      new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );
  return items.slice(0, ACTIVITY_LIMIT);
}

export default function Home() {
  // const { user, profile } = useAuth();
  const { user, profile } = useAuthStore(
    useShallow((state) => ({
      user: state.user,
      profile: state.profile,
    })),
  );
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [upworkConnected, setUpworkConnected] = useState<boolean | null>(null);
  const [upworkActivity, setUpworkActivity] =
    useState<UpworkActivityResponse | null>(null);
  const [upworkContexts, setUpworkContexts] =
    useState<UpworkContextsResponse | null>(null);
  const [upworkContextId, setUpworkContextId] = useState("");
  const [loading, setLoading] = useState(true);
  const [upworkActivityLoading, setUpworkActivityLoading] = useState(false);

  // First-run onboarding is not handled here. Upstream had no server-side
  // gate, so the dashboard read the onboarding row on mount, marked it
  // completed, and redirected to /getting-started. This build redirects at
  // sign-in (`resolvePostAuthRedirect`) and the checklist page marks itself
  // completed when shown, so repeating it here only bounced a user who had
  // just come from there straight back again.

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [statsRes, settingsRes] = await Promise.all([
          apiFetch("/api/dashboard/stats"),
          apiFetch("/api/settings"),
        ]);
        if (cancelled) return;

        if (statsRes.ok) {
          const data = (await statsRes.json()) as DashboardStats;
          setStats(data);
        }
        if (settingsRes.ok) {
          const s = (await settingsRes.json()) as { upwork_connected: boolean };
          setUpworkConnected(s.upwork_connected);
        } else {
          setUpworkConnected(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch dashboard stats:", error);
          setUpworkConnected(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const run = async () => {
      try {
        const res = await apiFetch("/api/dashboard/upwork-contexts");
        if (cancelled) return;

        if (res.ok) {
          const data = (await res.json()) as UpworkContextsResponse;
          setUpworkContexts(data);
        } else {
          setUpworkContexts({ contexts: [], skipped: true });
        }
      } catch {
        if (!cancelled) {
          setUpworkContexts({
            contexts: [],
            skipped: true,
            error: "Failed to load Upwork contexts",
          });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  /**
   * Pick the selected Upwork context once the list arrives.
   *
   * Derived during render rather than in an effect: it is a pure function of
   * `upworkContexts`, and a synchronous setState inside an effect is the
   * cascading render `react-hooks/set-state-in-effect` flags. Doing it here also
   * removes the frame where the selector renders empty before settling.
   *
   * "organizationId" here is an UPWORK organization: a freelancer profile or
   * agency the account can act as, not this app's tenancy.
   */
  const [syncedContexts, setSyncedContexts] = useState(upworkContexts);
  if (syncedContexts !== upworkContexts) {
    setSyncedContexts(upworkContexts);

    if (upworkContexts) {
      if (upworkContexts.skipped || upworkContexts.contexts.length === 0) {
        setUpworkContextId("");
      } else {
        const ctxs = upworkContexts.contexts;
        const ids = new Set(ctxs.map((c) => c.organizationId));

        let stored: string | null = null;
        try {
          const raw = localStorage.getItem(UPWORK_CONTEXT_STORAGE_KEY)?.trim();
          if (raw && ids.has(raw)) stored = raw;
        } catch {
          /* ignore */
        }

        setUpworkContextId((prev) => {
          if (ids.has(prev)) return prev;
          const next = stored ?? ctxs[0].organizationId;
          persistUpworkContext(next);
          return next;
        });
      }
    }
  }

  useEffect(() => {
    if (!user) return;
    if (upworkContexts === null) return;
    if (
      !upworkContexts.skipped &&
      upworkContexts.contexts.length > 0 &&
      !upworkContextId
    ) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      setUpworkActivityLoading(true);
      try {
        const path =
          upworkContextId.length > 0
            ? upworkActivityUrl(upworkContextId)
            : "/api/dashboard/upwork-activity";
        const res = await apiFetch(path);
        if (cancelled) return;

        if (res.ok) {
          const data = (await res.json()) as UpworkActivityResponse;
          setUpworkActivity(data);
        } else {
          setUpworkActivity({ items: [] });
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch Upwork activity:", error);
          setUpworkActivity({ items: [] });
        }
      } finally {
        if (!cancelled) {
          setUpworkActivityLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user, upworkContexts, upworkContextId]);

  const activityRows = useMemo(
    () => buildUpworkActivityRows(upworkActivity),
    [upworkActivity],
  );

  const proposalsDailyData = useMemo(() => {
    const items = upworkActivity?.items ?? [];
    const now = new Date();
    const buckets: { label: string; count: number; key: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const dt = new Date(now);
      dt.setDate(dt.getDate() - i);
      const start = startOfDay(dt);
      buckets.push({ label: dayLabel(start), count: 0, key: start.getTime() });
    }

    const byKeyTotal = new Map<number, number>();
    const byKeyOffered = new Map<number, number>();
    for (const b of buckets) {
      byKeyTotal.set(b.key, 0);
      byKeyOffered.set(b.key, 0);
    }

    for (const it of items) {
      const t = Date.parse(it.submittedAt);
      if (Number.isNaN(t)) continue;
      const day = startOfDay(new Date(t)).getTime();
      if (!byKeyTotal.has(day)) continue;
      byKeyTotal.set(day, (byKeyTotal.get(day) ?? 0) + 1);
      if (isOfferedVendorProposalStatus(it.status)) {
        byKeyOffered.set(day, (byKeyOffered.get(day) ?? 0) + 1);
      }
    }

    return buckets.map((b) => ({
      label: b.label,
      count: byKeyTotal.get(b.key) ?? 0,
      offeredCount: byKeyOffered.get(b.key) ?? 0,
    }));
  }, [upworkActivity]);

  const dailyMax = useMemo(() => {
    return proposalsDailyData.reduce(
      (m, p) => Math.max(m, p.count, p.offeredCount),
      0,
    );
  }, [proposalsDailyData]);

  const dailyTickStep = useMemo(() => {
    if (dailyMax <= 10) return 2;
    if (dailyMax <= 25) return 5;
    return 10;
  }, [dailyMax]);

  const dailyTicks = useMemo(() => {
    const maxTick = Math.ceil((dailyMax + 1) / dailyTickStep) * dailyTickStep;
    const ticks: number[] = [];
    for (let t = 0; t <= maxTick; t += dailyTickStep) ticks.push(t);
    return ticks;
  }, [dailyMax, dailyTickStep]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);

    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true, // false for 24-hour format
    });
  };

  const showUpworkHint =
    upworkActivity?.error &&
    !upworkActivity?.skipped &&
    (upworkActivity?.items?.length ?? 0) === 0;
  const upworkVendorContexts = upworkContexts?.contexts ?? [];
  const hasUpworkConnection =
    upworkContexts !== null && upworkContexts.skipped !== true;
  // Only a real choice earns a dropdown. One org renders as a static label.
  const showUpworkContextPicker =
    hasUpworkConnection && upworkVendorContexts.length > 1;
  const showSoleUpworkOrg =
    hasUpworkConnection && upworkVendorContexts.length === 1;
  const soleUpworkOrgLabel = showSoleUpworkOrg
    ? formatUpworkContextOptionLabel(upworkVendorContexts[0])
    : "";
  const showUpworkClientOnlyNotice = upworkContexts?.clientOnly === true;

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
      >
        {/* Total Proposals */}
        <Card className="bg-gradient-to-br from-gray-900 to-gray-800 text-white border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white">
              Total Proposals
            </CardTitle>
            <FileText className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-5xl font-bold  text-white">
                  {loading ? "..." : (stats?.proposalCount ?? 0)}
                </div>
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-2">
                  <TrendingUp className="h-3 w-3 text-green-400" />
                  <span className="text-green-400">Total generated</span>
                </p>
              </div>
              <div className="flex items-end gap-0.5 h-12 mb-1">
                <div
                  className="w-2 bg-primary/40 rounded-sm"
                  style={{ height: "30%" }}
                />
                <div
                  className="w-2 bg-primary/60 rounded-sm"
                  style={{ height: "50%" }}
                />
                <div
                  className="w-2 bg-primary rounded-sm"
                  style={{ height: "80%" }}
                />
                <div
                  className="w-2 bg-primary rounded-sm"
                  style={{ height: "100%" }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Portfolio Projects */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Portfolio Projects
            </CardTitle>
            <FolderOpen className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {loading ? "..." : (stats?.projectCount ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Across multiple categories
            </p>
          </CardContent>
        </Card>

        {/* Saved Templates */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Saved Templates
            </CardTitle>
            <FileCode className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {loading ? "..." : (stats?.templateCount ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Ready to use</p>
          </CardContent>
        </Card>

      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <CardTitle>Proposals sent</CardTitle>
              <p className="text-muted-foreground text-sm mt-1">
                Daily proposal volume for the past 7 days.
              </p>
            </div>

            {showUpworkContextPicker ? (
              <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end">
                <Label
                  htmlFor="dashboard-upwork-context"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Sent from
                </Label>
                {upworkContextId ? (
                  <Select
                    value={upworkContextId}
                    onValueChange={(v) => {
                      setUpworkContextId(v);
                      persistUpworkContext(v);
                    }}
                  >
                    <SelectTrigger id="dashboard-upwork-context" size="sm">
                      <SelectValue placeholder="Choose profile" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {upworkVendorContexts.map((row) => (
                        <SelectItem
                          key={row.organizationId}
                          value={row.organizationId}
                        >
                          {formatUpworkContextOptionLabel(row)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Loading profiles…
                  </p>
                )}
              </div>
            ) : showSoleUpworkOrg ? (
              <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end">
                <span className="text-muted-foreground text-xs font-medium">
                  Sent from
                </span>
                <span className="text-xs font-medium">{soleUpworkOrgLabel}</span>
              </div>
            ) : showUpworkClientOnlyNotice ? (
              <p className="text-muted-foreground shrink-0 text-xs sm:max-w-xs sm:text-right">
                The connected Upwork account has no freelancer or agency
                profile, so there is nothing to chart here.
              </p>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {upworkActivityLoading ? (
            <Skeleton className="h-[260px] w-full rounded-lg" />
          ) : (
            <ChartContainer
              className="h-[260px] w-full"
              config={{
                count: {
                  label: "All proposals",
                  color: "#e1f74c",
                },
                offeredCount: {
                  label: "Client sent offer",
                  color: "#818cf8",
                },
              }}
            >
              <LineChart
                data={proposalsDailyData}
                margin={{ top: 8, left: 18, right: 28, bottom: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  padding={{ left: 8, right: 16 }}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                />
                <YAxis
                  width={34}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  ticks={dailyTicks}
                  domain={[0, dailyTicks[dailyTicks.length - 1] ?? 0]}
                  allowDecimals={false}
                />
                <ChartTooltip
                  cursor={{ stroke: "hsl(var(--border))" }}
                  content={<ChartTooltipContent />}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  formatter={(value) => (
                    <span className="text-muted-foreground">{value}</span>
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="All proposals"
                  stroke="var(--color-count)"
                  strokeWidth={2.5}
                  dot={{
                    r: 4,
                    strokeWidth: 0,
                    stroke: "transparent",
                    fill: "var(--color-count)",
                  }}
                  activeDot={{
                    r: 6,
                    strokeWidth: 2,
                    stroke: "hsl(var(--background))",
                    fill: "var(--color-count)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="offeredCount"
                  name="Offered (client offer)"
                  stroke="var(--color-offeredCount)"
                  strokeWidth={2.5}
                  dot={{
                    r: 4,
                    strokeWidth: 0,
                    stroke: "transparent",
                    fill: "var(--color-offeredCount)",
                  }}
                  activeDot={{
                    r: 6,
                    strokeWidth: 2,
                    stroke: "hsl(var(--background))",
                    fill: "var(--color-offeredCount)",
                  }}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_350px] items-start">
        {/* Recent Activity: Upwork vendor proposals only */}
        <Card className="flex flex-col max-h-130">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Activity</CardTitle>
                <p className="text-xs text-muted-foreground font-normal mt-1">
                  Proposals sent on Upwork
                </p>
              </div>
              <Link href="/settings">
                <Button variant="link" className="text-primary h-auto p-0">
                  Upwork settings
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto min-h-0">
            {showUpworkHint ? (
              <p className="text-xs text-amber-700 dark:text-amber-500/90 mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                Upwork proposals could not be loaded. Ensure Upwork is connected
                and your API key includes &quot;Client Proposals - Read And
                Write Access&quot;, then reconnect.
                {upworkActivity?.error
                  ? ` (${upworkActivity.error.slice(0, 120)}${upworkActivity.error.length > 120 ? "…" : ""})`
                  : null}
              </p>
            ) : null}
            <div className="space-y-2">
              {upworkActivityLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-4 p-2">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2 pt-1">
                      <Skeleton className="h-3.5 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))
              ) : activityRows.length > 0 ? (
                activityRows.map((row) => (
                  <Link
                    target="_blank"
                    href={`https://www.upwork.com/nx/proposals/${row.vendorProposalId}`}
                    key={row.vendorProposalId}
                    className="flex items-start gap-4 hover:bg-gray-100 p-2 rounded-md transition-colors"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/15 dark:bg-sky-400/10 hover:bg-sky-500/20 dark:hover:bg-sky-400/20 transition-colors">
                      <Send className="h-5 w-5 text-sky-600 dark:text-sky-400   transition-colors" />
                    </div>
                    <div className="flex-1 space-y-1 min-w-0">
                      <p className="text-sm font-semibold leading-relaxed">
                        {row.jobTitle}
                      </p>
                      <div className="flex items-center gap-1.5 min-w-0 text-xs">
                        {/*
                          No globe fallback: a city-only location renders as
                          plain text rather than implying we know a country.
                        */}
                        <CountryFlag
                          country={row.clientCountry}
                          width="1rem"
                          height="0.75rem"
                          fallback={false}
                        />
                        <span className="truncate font-medium text-primary">
                          {row.clientLabel}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {formatDate(row.submittedAt)}
                        </span>
                        {(() => {
                          const b = getUpworkProposalStatusBadge(row.status);
                          return (
                            <Badge
                              variant="outline"
                              className={b.className}
                              title={row.status}
                            >
                              {b.text}
                            </Badge>
                          );
                        })()}
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Send className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {upworkActivity?.skipped
                      ? "Connect Upwork in Settings to see proposals you've sent on Upwork."
                      : showUpworkClientOnlyNotice
                        ? "The connected Upwork account has no freelancer or agency profile, so there are no proposals to show. Connect the account you send proposals from in Settings."
                        : "No Upwork proposals in your recent activity yet. Apply to jobs on Upwork to see them here."}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/proposals/new">
                <Button
                  className="w-full mb-3 justify-start gap-2 h-11 bg-accent hover:bg-accent/90 text-accent-foreground"
                  size="lg"
                >
                  <Sparkles className="h-5 w-5" />
                  Generate Proposal
                </Button>
              </Link>
              <Link href="/portfolios/new">
                <Button
                  variant="outline"
                  className="w-full mb-3 justify-start gap-2 h-11"
                  size="lg"
                >
                  <Plus className="h-5 w-5" />
                  Add New Project
                </Button>
              </Link>
              <Link href="/templates/new">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 h-11"
                  size="lg"
                >
                  <FileCode className="h-5 w-5" />
                  Create Template
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Connect Upwork prompt, shown until the user connects their Upwork account */}
          {upworkConnected === false && (
            <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
              <CardHeader>
                <CardTitle className="text-base">
                  Connect Upwork
                  {profile?.full_name
                    ? `, ${profile.full_name.split(" ")[0]}`
                    : ""}
                  !
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect your Upwork account to start importing jobs and
                  generating AI-powered proposals.
                </p>
                <Link href="/settings?tab=integrations">
                  <Button className="w-full" size="lg">
                    Connect Upwork
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
