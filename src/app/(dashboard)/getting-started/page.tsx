"use client";

import { apiFetch } from "@/lib/api-fetch";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, ArrowRight, Rocket, Trophy, KeyRound } from "lucide-react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { FLOW_IDS } from "@/lib/onboarding/constants";
import type {
  GettingStartedStep,
  GettingStartedStepId,
} from "@/lib/onboarding/getting-started-steps";

/**
 * The first-run checklist.
 *
 * Two changes from the commercial build:
 *
 * - **An AI key step, first.** There is no platform key here, so nothing that
 *   calls a model works until the user saves their own. It also gates the
 *   portfolio step, which the list says out loud rather than letting a green
 *   tick imply that unembedded projects are being matched.
 * - **No shared-access branch.** Upstream offered paid users a one-click OAuth
 *   against a platform-owned Upwork app, which is why "Connect Upwork" sat
 *   first for them and the page carried a POST-and-redirect handler. Everyone
 *   registers their own app here, so credentials come first and every CTA is a
 *   plain link.
 */

interface StatusResponse {
  steps: GettingStartedStep[];
  completedCount: number;
  totalCount: number;
}

/**
 * Rendered while the status request is in flight, so the guide text is on
 * screen immediately instead of sitting behind a skeleton. Only the per-step
 * action is skeletoned, because that is the part that depends on the response.
 *
 * The order matches `buildGettingStartedSteps` exactly; there is no plan
 * branch, so nothing here moves once the response lands.
 */
const LOADING_STEPS: { id: GettingStartedStepId; label: string }[] = [
  { id: "ai_key", label: "Add your OpenAI API key" },
  { id: "upwork_credentials", label: "Add Upwork API Client ID & Secret" },
  { id: "upwork_connect", label: "Connect Upwork" },
  { id: "filters", label: "Create Filters" },
  { id: "personas", label: "Create Personas" },
  { id: "knowledge_base", label: "Add Knowledge Base" },
  { id: "portfolio", label: "Add Portfolio" },
  { id: "templates", label: "Create Templates" },
  { id: "hooks", label: "Set Up Hooks" },
];

/** Fallback while the status request is in flight. Matches the server list length. */
const TOTAL_STEPS = LOADING_STEPS.length;

const STEP_META: Record<
  GettingStartedStepId,
  {
    description: string;
    /** Shown only while the step is incomplete: why the work is worth doing. */
    why: string;
    href: string;
    cta: string;
    numberColor: string;
    numberBg: string;
  }
> = {
  ai_key: {
    description:
      "Save your own OpenAI API key in Settings. It is the only key this app uses, and there is no shared one.",
    why: "Every AI feature runs on your key: generating proposals, qualifying jobs, and matching your portfolio to a job. Without it none of them do anything.",
    href: "/settings?tab=ai-models",
    cta: "Add API Key",
    numberColor: "text-rose-600 dark:text-rose-400",
    numberBg: "bg-rose-50 dark:bg-rose-950/40",
  },
  upwork_credentials: {
    description:
      "Register your own Upwork developer app, then save its Client ID and Secret in Settings.",
    why: "Upwork only issues job data to a registered app. Yours is the one this instance uses, and it is what the next step connects through.",
    href: "/settings?tab=integrations",
    cta: "Add Upwork App",
    numberColor: "text-blue-600 dark:text-blue-400",
    numberBg: "bg-blue-50 dark:bg-blue-950/40",
  },
  upwork_connect: {
    description:
      "Link your Upwork account to the app you just registered, so the job feed can pull live results.",
    why: "Without a linked account there is nothing to read jobs with, so your feed stays empty.",
    href: "/settings?tab=integrations",
    cta: "Connect Upwork",
    numberColor: "text-emerald-600 dark:text-emerald-400",
    numberBg: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  filters: {
    description:
      "Configure job filters so your feed only shows roles that match your expertise.",
    why: "Filters decide which jobs reach you. Without one you see everything and miss the work that fits.",
    href: "/filters",
    cta: "Set Up Filters",
    numberColor: "text-violet-600 dark:text-violet-400",
    numberBg: "bg-violet-50 dark:bg-violet-950/40",
  },
  personas: {
    description:
      "Define AI personas to shape the tone, style, and voice of your proposals.",
    why: "The persona sets tone and voice, so proposals sound like you instead of generic AI.",
    href: "/personas",
    cta: "Create Personas",
    numberColor: "text-sky-600 dark:text-sky-400",
    numberBg: "bg-sky-50 dark:bg-sky-950/40",
  },
  knowledge_base: {
    description:
      "Tell the AI about your expertise, your results, and how you work, so every proposal has real facts to cite.",
    why: "Without it the AI has nothing true to say about you, so proposals fall back on generic filler that clients skim past.",
    href: "/settings?tab=knowledge-base",
    cta: "Add Knowledge",
    numberColor: "text-purple-600 dark:text-purple-400",
    numberBg: "bg-purple-50 dark:bg-purple-950/40",
  },
  portfolio: {
    description:
      "Showcase your best work. The AI matches it to each job and cites the closest projects. Needs your OpenAI key.",
    why: "The AI cites your real projects as proof, which is what makes a client reply.",
    href: "/portfolios",
    cta: "Add Projects",
    numberColor: "text-amber-600 dark:text-amber-400",
    numberBg: "bg-amber-50 dark:bg-amber-950/40",
  },
  templates: {
    description:
      "Build reusable templates to accelerate proposal generation for similar jobs.",
    why: "Templates keep structure consistent and cut generation time on repeat job types.",
    href: "/templates",
    cta: "Create Templates",
    numberColor: "text-teal-600 dark:text-teal-400",
    numberBg: "bg-teal-50 dark:bg-teal-950/40",
  },
  hooks: {
    description:
      "Write reusable opening lines so every proposal starts with something that earns the next sentence.",
    why: "The first line decides whether the rest gets read. Saved hooks give the AI a proven one to open with.",
    href: "/hooks",
    cta: "Set Up Hooks",
    numberColor: "text-orange-600 dark:text-orange-400",
    numberBg: "bg-orange-50 dark:bg-orange-950/40",
  },
};

/** Shown under a step whose effect depends on another step being done first. */
const BLOCKED_NOTE: Record<GettingStartedStepId, string | undefined> = {
  ai_key: undefined,
  upwork_credentials: undefined,
  upwork_connect: undefined,
  filters: undefined,
  personas: undefined,
  knowledge_base: undefined,
  portfolio:
    "Adding portfolio work needs your OpenAI key: it generates the embedding that matches a project to a job. Add the key above first.",
  templates: undefined,
  hooks: undefined,
};

export default function GettingStartedPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await apiFetch("/api/getting-started/status");
        if (!cancelled && res.ok) {
          setStatus((await res.json()) as StatusResponse);
        }
      } catch {
        // Fail silently: the guide copy is useful even with no counts.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Being shown this page once is what completes the first-run flow.
   *
   * `resolvePostAuthRedirect` sends every sign-in here until the row says
   * completed, so without this the user is redirected back here forever. It
   * does not mean setup is finished; the checklist below tracks that, and the
   * sidebar keeps its "Get Started" entry until every step is done.
   *
   * Upstream marked it from the dashboard and then bounced the user here.
   * There is a server-side redirect in this build, so marking it here instead
   * removes the second bounce.
   */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await apiFetch(
          `/api/onboarding?flow_id=${FLOW_IDS.firstRunGettingStarted}`,
        );
        if (cancelled || !res.ok) return;
        const { row } = (await res.json()) as {
          row: { status: string } | null;
        };
        if (row?.status === "completed" || row?.status === "skipped") return;

        await apiFetch("/api/onboarding", {
          method: "PATCH",
          body: JSON.stringify({
            flow_id: FLOW_IDS.firstRunGettingStarted,
            status: "completed",
            completed_at: new Date().toISOString(),
          }),
        });
      } catch {
        // Fail silently: worst case the user lands here again next sign-in.
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const completedCount = status?.completedCount ?? 0;
  const totalCount = status?.totalCount ?? TOTAL_STEPS;
  const allDone = !loading && completedCount === totalCount;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const remaining = totalCount - completedCount;

  // One row shape for both states, so the card markup is written once. While
  // loading, every row is `pending` and nothing is `done`.
  const stepRows: (GettingStartedStep & { pending: boolean })[] = loading
    ? LOADING_STEPS.map((s) => ({ ...s, done: false, pending: true }))
    : (status?.steps ?? []).map((s) => ({ ...s, pending: false }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
      {/* Hero */}
      <Card className="overflow-hidden border-0 bg-sidebar text-sidebar-foreground shadow-lg">
        <CardContent className="p-7">
          <div className="mb-3 flex items-center gap-2.5">
            {/* Brand lime as a background with the near-black foreground on
                top. It is too light to read as a color on the icon itself. */}
            <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
              <Rocket className="size-4" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground">
              Setup Guide
            </span>
          </div>

          {/* Two things this heading must not do.
              `text-sidebar-foreground`: that token already carries ~70% alpha
              because it is sized for nav labels, so a heading wearing it reads
              as disabled text on this near-black surface. Headings on the
              always-dark surfaces here take white, as the dashboard stat cards
              do; `bg-sidebar` is near-black in both themes, so nothing flips.
              `font-bold`: Cal Sans ships weight 400 only, so any bolder weight
              is synthesized by the browser and smears the glyphs together. */}
          <h1 className="font-heading text-2xl font-normal text-white">
            Get Started with ProposalLift
          </h1>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-sidebar-foreground">
            {allDone
              ? "You've completed every setup step. Start generating proposals."
              : `Complete ${remaining} more step${remaining !== 1 ? "s" : ""} to finish setting up your instance.`}
          </p>

          {/* Progress bar. Animated by framer-motion rather than a
              paint-then-transition effect, so there is no state to sync. */}
          <div className="mt-5 space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-sidebar-foreground/25">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${loading ? 0 : progressPct}%` }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 0.7, ease: "easeOut" }
                }
              />
            </div>
            <p className="text-[12px] text-sidebar-foreground">
              {loading
                ? " "
                : allDone
                  ? "All steps complete"
                  : `${completedCount} of ${totalCount} complete`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* All-done banner */}
      {allDone && (
        <Card className="border-primary/25 bg-primary/5 shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Trophy className="size-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">Setup complete!</p>
              <p className="text-sm text-muted-foreground">
                You&apos;re all set. Head to Proposals to start winning jobs.
              </p>
            </div>
            <Link href="/proposals/new" className="shrink-0">
              <Button size="sm" className="gap-1.5">
                New Proposal
                <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Step list */}
      <div className="space-y-2.5">
        {stepRows.map((step, index) => {
          const meta = STEP_META[step.id];
          if (!meta) return null;

          // The first row is always the next thing that unblocks the most, so
          // pulsing it while it is incomplete points at the real next action.
          const isFirst = index === 0;
          const blockedNote = step.blockedBy
            ? BLOCKED_NOTE[step.id]
            : undefined;

          return (
            <Card
              key={step.id}
              className={cn(
                "border transition-all duration-200",
                step.done
                  ? "border-border/50 bg-muted/30"
                  : "border-border hover:shadow-sm",
              )}
            >
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                {/* Step number, or a check once done */}
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    step.done ? "bg-primary/10" : meta.numberBg,
                  )}
                >
                  {step.done ? (
                    <CheckCircle2 className="size-5 text-primary" />
                  ) : (
                    <span
                      className={cn(
                        "text-sm font-bold tabular-nums",
                        meta.numberColor,
                      )}
                    >
                      {index + 1}
                    </span>
                  )}
                </div>

                {/* Label, description, and reason */}
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-base font-semibold leading-snug",
                      step.done ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {step.label}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-sm leading-relaxed",
                      step.done
                        ? "text-muted-foreground/60"
                        : "text-muted-foreground",
                    )}
                  >
                    {meta.description}
                  </p>
                  {!step.done && (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground/80">
                      <span className="font-semibold text-foreground/70">
                        Why:{" "}
                      </span>
                      {meta.why}
                    </p>
                  )}
                  {blockedNote && (
                    <p className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span>{blockedNote}</span>
                    </p>
                  )}
                </div>

                {/* Action */}
                <div className="shrink-0">
                  {step.pending ? (
                    <Skeleton className="h-9 w-28 rounded-md" />
                  ) : step.done ? (
                    <div className="flex items-center gap-1.5 text-primary">
                      <CheckCircle2 className="size-4" />
                      <span className="text-xs font-semibold">Completed</span>
                    </div>
                  ) : (
                    <motion.div
                      animate={
                        reduceMotion || !isFirst
                          ? undefined
                          : { scale: [1, 1.06, 1] }
                      }
                      transition={{
                        duration: 1.6,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      <Link href={meta.href}>
                        <Button size="sm" className="h-9 gap-1.5 px-4 shadow-sm">
                          {meta.cta}
                          <ArrowRight className="size-3.5" />
                        </Button>
                      </Link>
                    </motion.div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
