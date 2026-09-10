"use client";

import { useState, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  AlertCircle,
  Users,
  Briefcase,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ShieldQuestionMark,
  type LucideIcon,
} from "lucide-react";
import { getClientTimeForCountry } from "@/lib/country-utils";
import { normalizeJobCountryToCanonical } from "@/lib/country-filter";
import { CountryFlag } from "@/components/CountryFlag";
import { cn } from "@/lib/utils";
import type {
  ClientRankFactor,
  ClientRankJob,
  ClientRankResult,
  ClientRankStatus,
} from "@/lib/client-rank";

const HOVER_DELAY_MS = 100;
const HOVER_CLOSE_DELAY_MS = 150;
const POPOVER_WIDTH = 320;
/** First-paint estimate only; a ResizeObserver corrects it once mounted. Sized
 *  for the header, the gate row and the four-factor "Why this rank" list. */
const POPOVER_EST_HEIGHT = 420;
const GAP = 8;

function isScrollableAncestor(el: HTMLElement): boolean {
  const s = getComputedStyle(el);
  return /(auto|scroll|overlay)/.test(
    `${s.overflow}${s.overflowY}${s.overflowX}`,
  );
}

/** Scroll containers between the trigger and the viewport (plus `window`). */
function getScrollParents(element: HTMLElement | null): EventTarget[] {
  const list: EventTarget[] = [];
  if (!element) {
    list.push(window);
    return list;
  }
  let parent = element.parentElement;
  while (parent) {
    if (isScrollableAncestor(parent)) list.push(parent);
    parent = parent.parentElement;
  }
  list.push(window);
  return list;
}

function computePopoverPosition(
  rect: DOMRect,
  popoverHeight: number,
): { top: number; left: number } {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const spaceBelow = vh - rect.bottom;
  const spaceAbove = rect.top;
  const needBelow = popoverHeight + GAP;
  const showAbove = spaceBelow < needBelow && spaceAbove > spaceBelow;
  let top = showAbove ? rect.top - popoverHeight - GAP : rect.bottom + GAP;
  top = Math.max(GAP, Math.min(top, vh - popoverHeight - GAP));
  let left = rect.right - POPOVER_WIDTH;
  left = Math.max(GAP, Math.min(left, vw - POPOVER_WIDTH - GAP));
  return { top, left };
}

interface ClientRankPopoverProps {
  job: ClientRankJob;
  /** The whole scoring result. The popover renders its evidence, never its own. */
  rank: ClientRankResult;
  children: React.ReactNode;
  /** When provided, popover is controlled. Only one popover can be open at a time when used from parent. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Light values are the filter-page palette, kept exactly as they were; the dark
 * variants exist because the Jobs feed renders this popover on a themed surface.
 */
const STATUS_COLORS: Record<ClientRankStatus, string> = {
  Risky: "text-[#F44336] dark:text-red-400",
  Medium: "text-[#FF9800] dark:text-amber-400",
  Excellent: "text-[#4CAF50] dark:text-green-400",
  Unknown: "text-[#6C757D] dark:text-muted-foreground",
};

const STATUS_LABELS: Record<ClientRankStatus, string> = {
  Risky: "Risky",
  Medium: "Medium",
  Excellent: "Excellent",
  Unknown: "Not enough data",
};

/**
 * One shield family so the four states read as a single system. This replaced
 * the old 1/3/5 digit, which implied a five-point scale that never existed —
 * the score has always been three buckets, and "3" invited people to read it as
 * "3 out of 5".
 */
const STATUS_ICONS: Record<ClientRankStatus, LucideIcon> = {
  Excellent: ShieldCheck,
  Medium: ShieldAlert,
  Risky: ShieldX,
  Unknown: ShieldQuestionMark,
};

/**
 * The feed badge. Owns the glyph and the accessible name; the caller supplies
 * the background via `className` because the two feeds keep different palettes
 * (the filter page is light-only, the jobs feed is themed).
 *
 * An icon carries less standalone meaning than a digit did, so the label is not
 * optional here: without it the badge would rest on colour and shape alone.
 */
export function ClientRankBadge({
  status,
  className,
  onClick,
}: {
  status: ClientRankStatus;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLSpanElement>) => void;
}) {
  const Icon = STATUS_ICONS[status];
  const label = `Client rank: ${STATUS_LABELS[status]}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 hover:opacity-90",
        className,
      )}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
    </span>
  );
}

/** Sub-score bands the factor dot colours follow. */
const FACTOR_STRONG = 0.7;
const FACTOR_FAIR = 0.35;

function factorDotClass(subscore: number | null): string {
  if (subscore == null) return "bg-[#CED4DA] dark:bg-muted-foreground/40";
  if (subscore >= FACTOR_STRONG) return "bg-[#4CAF50]";
  if (subscore >= FACTOR_FAIR) return "bg-[#FF9800]";
  return "bg-[#F44336]";
}

/**
 * One row of the "Why this rank" list. Unresolved factors read muted.
 *
 * The label keeps its natural width and the detail takes the remainder, so a
 * long value ("4.9 from 1,240 reviews") wraps inside its own column instead of
 * pushing into the label. The popover is only 320px wide, which is why the
 * rating detail is text rather than stars.
 */
function FactorRow({ factor }: { factor: ClientRankFactor }) {
  const unresolved = factor.subscore == null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          factorDotClass(factor.subscore),
        )}
        aria-hidden
      />
      <span className="shrink-0 text-[#6C757D] dark:text-muted-foreground">
        {factor.label}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 text-right",
          unresolved
            ? "text-[#999999] dark:text-muted-foreground"
            : "font-medium text-[#333333] dark:text-foreground",
        )}
      >
        {factor.detail}
      </span>
    </div>
  );
}

export function ClientRankPopover({
  job,
  rank,
  children,
  open: controlledOpen,
  onOpenChange,
}: ClientRankPopoverProps) {
  const { status, factors } = rank;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = useCallback(
    (value: boolean) => {
      if (onOpenChange) onOpenChange(value);
      else setInternalOpen(value);
    },
    [onOpenChange],
  );
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clearing on close is a pure derivation of `open`, so it happens during
  // render rather than in the layout effect below — a synchronous setState in an
  // effect body is the cascading render the lint rule flags.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setPosition(null);
  }

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const el = triggerRef.current;
      if (!el) return;
      const pop = popoverRef.current;
      const h =
        pop && pop.offsetHeight > 0
          ? pop.getBoundingClientRect().height
          : POPOVER_EST_HEIGHT;
      setPosition(computePopoverPosition(el.getBoundingClientRect(), h));
    };

    updatePosition();

    let rafId = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updatePosition);
    };

    const el = triggerRef.current;
    const scrollParents = getScrollParents(el);
    const scrollOpts: AddEventListenerOptions = {
      passive: true,
      capture: true,
    };
    for (const parent of scrollParents) {
      parent.addEventListener("scroll", scheduleUpdate, scrollOpts);
    }
    window.addEventListener("resize", scheduleUpdate);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", scheduleUpdate);
    vv?.addEventListener("scroll", scheduleUpdate);

    let triggerRo: ResizeObserver | null = null;
    if (el) {
      triggerRo = new ResizeObserver(scheduleUpdate);
      triggerRo.observe(el);
    }

    let popoverRo: ResizeObserver | null = null;
    const attachPopoverObserver = () => {
      const node = popoverRef.current;
      if (!node || popoverRo) return;
      popoverRo = new ResizeObserver(scheduleUpdate);
      popoverRo.observe(node);
    };

    const rafFollowUp = requestAnimationFrame(() => {
      updatePosition();
      attachPopoverObserver();
      requestAnimationFrame(() => {
        updatePosition();
        attachPopoverObserver();
      });
    });

    return () => {
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(rafFollowUp);
      for (const parent of scrollParents) {
        parent.removeEventListener("scroll", scheduleUpdate, scrollOpts);
      }
      window.removeEventListener("resize", scheduleUpdate);
      vv?.removeEventListener("resize", scheduleUpdate);
      vv?.removeEventListener("scroll", scheduleUpdate);
      triggerRo?.disconnect();
      popoverRo?.disconnect();
    };
  }, [open]);

  const paymentVerified = job.client_payment_verified === true;
  /**
   * Every scored factor comes from `rank.factors`, so nothing here recomputes
   * what the scorer already decided. Only the unscored context below is derived.
   */
  const resolvedCount = factors.filter((f) => f.subscore != null).length;
  /**
   * City is rendered on the location row below, so the time row stays a bare
   * clock. `formatClientLocalTime` yields a placeholder for countries with no
   * timezone mapping — treat that as "unknown" rather than printing it.
   */
  const rawClientTime = job.client_country
    ? getClientTimeForCountry(job.client_country)
    : null;
  const clientTime =
    rawClientTime && rawClientTime !== "—" ? rawClientTime : null;
  /** Prefer the readable canonical name over Upwork's raw code ("AUS" → "Australia"). */
  const countryLabel =
    normalizeJobCountryToCanonical(job.client_country) ?? job.client_country;
  /**
   * Upwork no longer returns a client name, so city plus country is the closest
   * thing to an identity we can show. Either part may be missing.
   */
  const clientCity = job.client_city?.trim() || null;
  const locationLabel = [clientCity, countryLabel].filter(Boolean).join(", ");
  const lastContractTitle = job.client_last_contract_title?.trim() || null;

  const formatDate = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? null
      : d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
  };
  const registeredFormatted = formatDate(job.client_member_since);
  const renewedFormatted = formatDate(job.renewed_at);

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    timeoutRef.current = setTimeout(() => setOpen(true), HOVER_DELAY_MS);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    closeTimeoutRef.current = setTimeout(
      () => setOpen(false),
      HOVER_CLOSE_DELAY_MS,
    );
  };

  const popoverContent =
    open &&
    position &&
    (typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popoverRef}
            className="fixed z-9999 min-w-[320px] animate-in fade-in-0 zoom-in-95"
            style={{ top: position.top, left: position.left }}
            onMouseEnter={() => {
              if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
              }
            }}
            onMouseLeave={handleMouseLeave}
          >
            <div
              className="w-[320px] rounded-xl shadow-lg border border-gray-100 bg-white overflow-hidden dark:border-border dark:bg-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white rounded-xl shadow-md p-4 space-y-3 dark:bg-card">
                {/* Header: Client Rank - Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-[#333333] dark:text-foreground">
                    Client Rank -{" "}
                    <span
                      className={cn("font-semibold", STATUS_COLORS[status])}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                  </div>
                  {renewedFormatted && (
                    <span
                      title={`Client re-posted this job on ${renewedFormatted}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#FFF3E0] px-2 py-0.5 text-[11px] font-bold text-[#E65100] dark:bg-amber-500/15 dark:text-amber-300"
                    >
                      Renewed
                    </span>
                  )}
                </div>

                {/* The gate. Verification is scored separately from the factors
                    below because an unverified client is Risky whatever else
                    they look like, so it gets its own row above the list. */}
                <div className="flex items-center gap-2 text-sm text-[#333333] dark:text-foreground">
                  {paymentVerified ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#4CAF50] text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F44336] text-white">
                      <AlertCircle className="h-3 w-3" />
                    </span>
                  )}
                  <span>
                    Payment method{" "}
                    {paymentVerified ? "verified" : "not verified"}
                  </span>
                </div>

                {!paymentVerified && (
                  <div className="rounded-md bg-[#FFEBEE] px-2 py-1.5 text-[12px] text-[#C62828] dark:bg-red-500/15 dark:text-red-300">
                    An unverified payment method caps this rank at Risky.
                  </div>
                )}

                {/* Why this rank: the scored factors, ordered by how much each
                    moved the result. Rendered straight from rank.factors so the
                    badge and this list cannot drift apart. */}
                {paymentVerified && (
                  <div className="space-y-1.5 border-t border-gray-100 pt-3 dark:border-border">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-[#6C757D] dark:text-muted-foreground">
                      Why this rank
                    </div>
                    {factors.map((factor) => (
                      <FactorRow key={factor.key} factor={factor} />
                    ))}
                    {resolvedCount < factors.length && (
                      <div className="pt-0.5 text-[12px] text-[#6C757D] dark:text-muted-foreground">
                        Based on {resolvedCount} of {factors.length} signals
                        {status === "Unknown"
                          ? ", too few to grade this client."
                          : "."}
                      </div>
                    )}
                  </div>
                )}

                {/* Competition. Kept out of the score on purpose: it describes
                    the posting's odds, not whether the client can be trusted. */}
                {job.total_applicants != null && (
                  <div className="flex items-center gap-2 border-t border-gray-100 pt-3 text-sm text-[#333333] dark:border-border dark:text-foreground">
                    <Users
                      className="h-4 w-4 shrink-0 text-[#6C757D] dark:text-muted-foreground"
                      aria-hidden
                    />
                    <span>
                      <span className="font-bold">{job.total_applicants}</span>{" "}
                      applicant{job.total_applicants !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}

                {/* What the client last hired for — the strongest "who is
                    this client" signal Upwork still exposes, now that the
                    company name field is retired. Not this posting's title. */}
                {lastContractTitle && (
                  <div className="flex items-start gap-2 text-sm">
                    <Briefcase
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#6C757D] dark:text-muted-foreground"
                      aria-hidden
                    />
                    <span className="text-[#333333] dark:text-foreground">
                      <span className="text-[#6C757D] dark:text-muted-foreground">Last hired for:</span>{" "}
                      <span className="font-medium">{lastContractTitle}</span>
                    </span>
                  </div>
                )}

                {/* Registered date. Account age is shown but never scored. */}
                {registeredFormatted && (
                  <div className="text-sm text-[#333333] dark:text-foreground">
                    Registered: {registeredFormatted}
                  </div>
                )}

                {/* Location — city when Upwork returns one, else country alone */}
                {locationLabel && (
                  <div className="flex items-center gap-2 text-sm text-[#333333] dark:text-foreground">
                    {job.client_country && (
                      <CountryFlag country={job.client_country} />
                    )}
                    <span>{locationLabel}</span>
                  </div>
                )}

                {/* 8. Client current time */}
                {clientTime && (
                  <div className="text-sm text-[#6C757D] dark:text-muted-foreground">
                    {clientTime} local time
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null);

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
      {popoverContent}
    </div>
  );
}
