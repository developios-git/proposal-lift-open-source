"use client";

import { Info, Loader2, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { QualifyVerdict } from "@/lib/jobs/qualify/types";

export type QualifyBadgeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "done";
      verdict: QualifyVerdict;
      reason: string;
      /** Criteria the model couldn't check — surfaced so they aren't silent passes. */
      unverifiable?: string[];
    };

export interface QualifyBadgeProps {
  state: QualifyBadgeState;
  onQualify: () => void;
}

/** Green/red reuse the client-rank pill tokens already used elsewhere on this row. */
const VERDICT_STYLES: Record<QualifyVerdict, string> = {
  qualified: "bg-[#4CAF50] text-white",
  disqualified: "bg-[#F44336] text-white",
};

const VERDICT_LABELS: Record<QualifyVerdict, string> = {
  qualified: "Qualified",
  disqualified: "Disqualified",
};

const PILL =
  "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold";

/** Every action on this badge bills the same amount; say so on all of them. */
const COST_NOTE = "Uses your own OpenAI key.";

/** shadcn tooltip wrapper, so the badge's hints match the rest of the app. */
function HoverHint({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-[240px]">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Per-job qualify control. Rendered only when the filter has saved criteria and
 * AI Qualify is active — the caller decides that, so this component never has to
 * reason about an inert state.
 *
 * The result reads on hover rather than click: checking a verdict is a glance,
 * not an action, and click-to-open cost a round trip per row.
 */
export function QualifyBadge({ state, onQualify }: QualifyBadgeProps) {
  if (state.status === "loading") {
    return (
      <span
        className={cn(PILL, "border border-gray-200 bg-white text-[#666666]")}
        aria-live="polite"
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Checking…
      </span>
    );
  }

  if (state.status === "error") {
    return (
      <HoverHint label={`Something went wrong. Try again. ${COST_NOTE}`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQualify();
          }}
          className={cn(
            PILL,
            "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
          )}
        >
          {/* The amber pill already signals that something went wrong; the
              glyph's job is to name the action, not repeat the alarm. */}
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Retry
        </button>
      </HoverHint>
    );
  }

  if (state.status === "idle") {
    return (
      <HoverHint
        label={`Check this job against your qualify criteria. ${COST_NOTE}`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQualify();
          }}
          className={cn(
            PILL,
            "border border-gray-200 bg-white text-[#666666] hover:bg-gray-50",
          )}
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          Qualify
        </button>
      </HoverHint>
    );
  }

  const unverifiable = state.unverifiable ?? [];
  const label = VERDICT_LABELS[state.verdict];

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {/* Re-check lives outside the pill so the pill itself is purely a
          hover target — one affordance, one behaviour.

          Hidden until the row is hovered on desktop (the parent row carries
          `group`), but always visible from `lg` down, where there is no hover.
          Opacity rather than `hidden` so the badge never shifts position. */}
      {/* No cost note here — the price is stated on the initial Qualify
          action, and repeating it on every row reads as nagging. */}
      <HoverHint label="Qualify again">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onQualify();
        }}
        aria-label="Qualify this job again"
        className={cn(
          // Rests gray, turns blue on its own hover. The icon stays the darker
          // navy against a light blue fill — matching both to one blue would
          // hide the glyph.
          "shrink-0 rounded border border-gray-200 bg-gray-100 p-1 text-[#9CA3AF]",
          // One declaration: `transition-opacity transition-colors` would have
          // the second silently win, killing the hover-reveal fade.
          "transition-[opacity,color,background-color,border-color] duration-150",
          "hover:border-[#60A5FA] hover:bg-[#BFDBFE] hover:text-[#1E3A8A]",
          "opacity-100 focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100",
        )}
      >
        <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </button>
      </HoverHint>

      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* tabIndex makes the tooltip reachable by keyboard, since this is
                no longer a button. */}
            <span
              tabIndex={0}
              onClick={(e) => e.stopPropagation()}
              aria-label={
                unverifiable.length > 0
                  ? `${label}, with ${unverifiable.length} criteria unchecked`
                  : label
              }
              className={cn(
                PILL,
                VERDICT_STYLES[state.verdict],
                "cursor-default outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {label}
              {/* Marks a verdict reached without checking every rule, so a
                  partial pass never looks like a full one.

                  A circle, not a triangle: at 12px on a saturated fill the
                  triangle's interior detail collapses into a smudge, and this
                  is a "see the tooltip" marker rather than an alarm. */}
              {unverifiable.length > 0 && (
                <Info className="h-3.5 w-3.5 opacity-80" aria-hidden />
              )}
            </span>
          </TooltipTrigger>
          {/* Dark surface on purpose: the rows behind it are white, and the
              built-in arrow is hardcoded to `bg-foreground` — a light bubble
              leaves a dark arrow stranded against it. */}
          <TooltipContent
            side="top"
            sideOffset={6}
            className="max-w-[280px] px-3 py-2 shadow-lg"
          >
            <p
              className={cn(
                "text-xs font-bold",
                state.verdict === "qualified"
                  ? "text-[#81C784]"
                  : "text-[#EF9A9A]",
              )}
            >
              {label}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-background/85">
              {state.reason}
            </p>
            {unverifiable.length > 0 && (
              <div className="mt-2 rounded-md border border-amber-400/40 bg-amber-400/15 px-2 py-1.5">
                {/* Same glyph as the pill marker — this block is what the
                    marker points at, so they need to be recognisable as a pair. */}
                <p className="flex items-center gap-1 text-[11px] font-bold text-amber-200">
                  <Info className="h-3 w-3" aria-hidden />
                  Couldn&apos;t check
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed text-amber-100/90">
                  {unverifiable.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}
