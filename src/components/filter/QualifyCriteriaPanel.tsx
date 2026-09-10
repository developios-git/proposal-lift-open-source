"use client";

import { useRef } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Loader2,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CriteriaExamplesDialog } from "@/components/filter/CriteriaExamplesDialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { QUALIFY_CRITERIA_MAX_LENGTH } from "@/lib/jobs/qualify/constants";

const PLACEHOLDER = `I build Next.js and React apps for B2B SaaS startups.

Qualify jobs with a budget over $1,000 that mention React, Next.js, or TypeScript.

Disqualify WordPress, Shopify, and data entry work.`;

export interface QualifyCriteriaPanelProps {
  /** Working copy of the criteria text. */
  criteria: string;
  onCriteriaChange: (value: string) => void;
  /** Whether qualifying is switched on for this filter. */
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  /** False until criteria have been saved at least once — drives the "Not set" status. */
  hasSavedCriteria: boolean;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  /** Returns to Filters mode. The caller confirms any discard. */
  onBack: () => void;
  /** Closes the sidebar drawer on mobile. */
  onCloseMobile: () => void;
  /** Wired in Phase 3. While absent, the Enhance button renders disabled. */
  onEnhance?: () => void;
  enhancing?: boolean;
  /**
   * Replaces the criteria with a chosen example. The caller snapshots the old
   * text for undo, so the panel never owns history.
   */
  onApplyExample: (text: string) => void;
  /** Restores the text from before the last enhance or example. */
  onUndo?: () => void;
  /** Names what the undo reverts — "Undo enhance" or "Undo example". */
  undoLabel?: string;
}

/**
 * Qualify mode for the filter page sidebar. Renders the same three-part shell as
 * Filters mode — sticky header, scrolling body, sticky footer — so swapping modes
 * does not shift the surrounding layout.
 */
export function QualifyCriteriaPanel({
  criteria,
  onCriteriaChange,
  enabled,
  onEnabledChange,
  hasSavedCriteria,
  dirty,
  saving,
  onSave,
  onBack,
  onCloseMobile,
  onEnhance,
  enhancing = false,
  onApplyExample,
  onUndo,
  undoLabel = "Undo",
}: QualifyCriteriaPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overLimit = criteria.length > QUALIFY_CRITERIA_MAX_LENGTH;
  const canEnhance =
    !!onEnhance && !enhancing && !saving && criteria.trim().length > 0;

  /**
   * An example is a starting point, not an answer — drop the caret at the end of
   * it so the user is already editing. Deferred a tick: Radix returns focus to
   * the dialog trigger as it closes, which would otherwise win.
   */
  function handleApplyExample(text: string) {
    onApplyExample(text);
    setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    }, 0);
  }

  return (
    <>
      {/* Sticky header — back button and status badge */}
      <div className="sticky top-0 z-10 border-b bg-[#f5f5f5] p-3">
        <div className="mb-2 flex items-center justify-between lg:hidden">
          <span className="text-sm font-bold">AI Qualify</span>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
            className="rounded p-1 hover:bg-muted/50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span className="truncate text-[11px] font-semibold uppercase text-[#5a6062]">
              Back to filter options
            </span>
          </button>
          <QualifyStatusBadge
            enabled={enabled}
            hasSavedCriteria={hasSavedCriteria}
            onEnabledChange={onEnabledChange}
          />
        </div>
      </div>

      {/* Scrolling body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
        {/* Framed as a hint card rather than loose text — it sits above the
            field it explains, so it needs to read as guidance, not as content. */}
        <div className="mb-4 flex gap-2.5 rounded-lg border border-border/70 bg-white p-3 shadow-xs">
          <Sparkles
            className="mt-px h-4 w-4 shrink-0 text-[#8a9400]"
            aria-hidden
          />
          <p className="text-xs leading-[1.6] text-muted-foreground">
            <span className="font-semibold text-foreground">
              Describe what makes a job a fit for your niche.
            </span>{" "}
            Each job is checked against this when you click its Qualify badge.
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {/* Both criteria actions sit on the label row, directly above the
              field they write to. Examples is ghost-styled so Enhance stays the
              dominant action — one is a starting point, the other is the paid
              step you take afterwards. */}
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <Label htmlFor="qualify-criteria" className="text-xs">
              Your criteria
            </Label>
            <div className="flex items-center gap-1">
            <CriteriaExamplesDialog
              hasExistingText={criteria.trim().length > 0}
              onSelect={handleApplyExample}
              disabled={enhancing || saving}
            />
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                {/* Wrapped in a span so the tooltip still fires while the
                    button is disabled — disabled buttons emit no pointer events. */}
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canEnhance}
                      onClick={onEnhance}
                      className="h-7 gap-1.5 px-2 text-[11px]"
                    >
                      {enhancing ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Enhancing…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3" />
                          Enhance with AI
                        </>
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end">
                  {onEnhance
                    ? "Rewrite your criteria into a clearer rubric for the AI. Uses your own OpenAI key."
                    : "Coming soon"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            </div>
          </div>
          <Textarea
            ref={textareaRef}
            id="qualify-criteria"
            value={criteria}
            onChange={(e) => onCriteriaChange(e.target.value)}
            disabled={enhancing || saving}
            placeholder={PLACEHOLDER}
            maxLength={QUALIFY_CRITERIA_MAX_LENGTH}
            className="min-h-[220px] resize-y bg-white text-sm"
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            {onUndo ? (
              <button
                type="button"
                onClick={onUndo}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                <Undo2 className="h-3 w-3" />
                {undoLabel}
              </button>
            ) : (
              <span />
            )}
            <span
              className={cn(
                "text-[11px] tabular-nums text-muted-foreground",
                overLimit && "font-semibold text-destructive",
              )}
            >
              {criteria.length} / {QUALIFY_CRITERIA_MAX_LENGTH}
            </span>
          </div>
        </div>
      </div>

      {/* Sticky footer — mirrors the Save changes bar in Filters mode */}
      <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-[#f5f5f5] p-3">
        <Button
          type="button"
          disabled={!dirty || saving || enhancing || overLimit}
          onClick={onSave}
          className={cn(
            "relative w-full font-semibold",
            dirty &&
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
            "Save criteria"
          )}
          {dirty && !saving && (
            <span
              className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-[#f5f5f5]"
              aria-hidden
            />
          )}
        </Button>
      </div>
    </>
  );
}

/** Active / Disabled switch, or a static "Not set" chip before the first save. */
function QualifyStatusBadge({
  enabled,
  hasSavedCriteria,
  onEnabledChange,
}: {
  enabled: boolean;
  hasSavedCriteria: boolean;
  onEnabledChange: (value: boolean) => void;
}) {
  if (!hasSavedCriteria) {
    return (
      <span
        title="Save your criteria to switch this on."
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-white px-2 py-1.5 text-[11px] font-semibold text-muted-foreground"
      >
        <span className="h-2 w-2 rounded-full border border-muted-foreground/40" />
        Not set
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`AI Qualify is ${enabled ? "active" : "disabled"}. Change status.`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-white px-2 py-1.5 text-[11px] font-semibold transition-colors hover:bg-muted/50"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              enabled ? "bg-[#4CAF50]" : "bg-muted-foreground/40",
            )}
          />
          {enabled ? "Active" : "Disabled"}
          <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => onEnabledChange(true)}>
          <Check
            className={cn("h-4 w-4", enabled ? "opacity-100" : "opacity-0")}
          />
          Active
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEnabledChange(false)}>
          <Check
            className={cn("h-4 w-4", enabled ? "opacity-0" : "opacity-100")}
          />
          Disabled
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
