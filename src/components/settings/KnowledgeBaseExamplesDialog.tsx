"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, BookOpen, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  KNOWLEDGE_BASE_EXAMPLES,
  type KnowledgeBaseExample,
} from "@/lib/knowledge-base/examples";

export interface KnowledgeBaseExamplesDialogProps {
  /** Drives the overwrite warning and the confirm button's wording. */
  hasExistingText: boolean;
  /** Called with the chosen example's text. The caller snapshots for undo. */
  onSelect: (text: string) => void;
  disabled?: boolean;
}

const FIRST = KNOWLEDGE_BASE_EXAMPLES[0];

/**
 * "Browse examples" affordance for the Knowledge Base field: pick a starting
 * point, preview it in full, then confirm.
 *
 * Selecting does not insert, confirming does. This replaces text the user may
 * have spent real time on, so it takes one deliberate step, and the preview pane
 * lets them compare all six before committing. Picking an example costs nothing
 * and calls no model; the strings are static.
 *
 * Dialog styling: 16px radius, uppercase eyebrow pill, `font-heading` title,
 * and h-12 / 10px radius buttons on the primary accent. Upstream this mirrored
 * a landing-page dialog; there is no marketing site here, so the surface and
 * border now read from `--background` / `--border` rather than the fixed hexes
 * that dialog used.
 *
 * Two adaptations that dialog does not need:
 *  - It sets the body font with `font-(family-name:--font-onest)`. `--font-onest`
 *    is declared in `landing.css` scoped to `.landing-root`, which Settings does
 *    not import, so that class would resolve to nothing here. `font-heading`
 *    (Cal Sans) is global and carries over unchanged.
 *  - It is a landing surface and so hardcodes a light palette. Settings supports
 *    dark mode, so every hardcoded colour is paired with a `dark:` token to keep
 *    the light rendering identical without shipping a light-only panel into a
 *    dark dashboard.
 *
 * Laid out in two panes rather than the single scrolling column used by
 * CriteriaExamplesDialog. These bodies run 1,400 to 2,200 characters against
 * that dialog's 400 to 700, so a single column would push the confirm button off
 * screen and leave the user with no way to commit.
 */
export function KnowledgeBaseExamplesDialog({
  hasExistingText,
  onSelect,
  disabled = false,
}: KnowledgeBaseExamplesDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(FIRST.id);
  const reduceMotion = useReducedMotion();

  /**
   * An empty knowledge base is exactly when this is the user's next action, and
   * the Save button beside it is disabled, so nothing competes for attention.
   * Once there is content, Save becomes the primary action and this steps back
   * to a quieter tinted button rather than disappearing.
   */
  const emphasize = !hasExistingText;

  const selected: KnowledgeBaseExample =
    KNOWLEDGE_BASE_EXAMPLES.find((e) => e.id === selectedId) ?? FIRST;

  function handleOpenChange(next: boolean) {
    // Reopening should not resume an abandoned selection.
    if (next) setSelectedId(FIRST.id);
    setOpen(next);
  }

  function handleConfirm() {
    onSelect(selected.text);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* The primary accent in both states. It never collides
          with the Save button below because the two are never both prominent:
          the filled state only shows while the field is empty, which is exactly
          when Save is disabled, and once there is content this drops to the
          tinted variant. The pulse is the same treatment the Getting Started
          list uses to point at the next action, and it is dropped under
          prefers-reduced-motion. */}
      <motion.div
        className="inline-flex"
        animate={
          reduceMotion || disabled || !emphasize
            ? undefined
            : { scale: [1, 1.05, 1] }
        }
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            className={cn(
              "h-9 gap-1.5 rounded-[10px] px-4 text-sm font-semibold",
              // Green text on a light green ground in both states. lime-700 for
              // the text rather than --primary itself: the brand lime is too
              // bright to pass contrast as text on a pale background — the same
              // reason globals.css overrides `.text-primary` to near-black.
              "border bg-lime-50 text-lime-700 hover:bg-lime-100 hover:text-lime-800",
              "dark:bg-lime-950/40 dark:text-lime-300",
              "dark:hover:bg-lime-900/40 dark:hover:text-lime-200",
              // Emphasis comes from the pulse, the icon, and a firmer edge
              // rather than a fill, so the button never reads as a second
              // primary action next to Save.
              emphasize
                ? "border-lime-300 shadow-sm shadow-lime-600/20 dark:border-lime-800"
                : "border-lime-200 dark:border-lime-900",
            )}
          >
            {emphasize ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <BookOpen className="h-4 w-4" />
            )}
            Browse examples
          </Button>
        </DialogTrigger>
      </motion.div>

      {/* A flex column, not the base grid: the header, warning, and footer take
          their natural height and the panes absorb whatever is left, so the
          confirm button is reachable at any viewport height. Fixed vh pane
          heights could total more than max-h and push the footer out of the
          overflow-hidden box. */}
      <DialogContent
        className={cn(
          "flex flex-col gap-0 overflow-hidden rounded-[16px] p-0 shadow-[0_24px_60px_-20px_rgba(11,15,10,0.35)]",
          "border border-border bg-background",
          "",
          "max-h-[88vh] sm:max-w-[880px]",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-5 px-7 py-8 sm:gap-6 sm:px-9 sm:py-9">
          <DialogHeader className="shrink-0 gap-2.5 text-left sm:text-left">
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1",
                "text-[11px] font-semibold uppercase tracking-[0.08em]",
                "border border-border bg-secondary text-muted-foreground",
                "dark:border-border dark:bg-muted dark:text-muted-foreground",
              )}
            >
              <BookOpen
                className="size-3.5 text-foreground"
                aria-hidden
              />
              Starter library
            </span>
            <DialogTitle className="font-heading text-[26px] font-normal capitalize leading-[1.2] text-foreground">
              Example knowledge bases
            </DialogTitle>
            <DialogDescription className="text-sm leading-[1.6] tracking-[-0.08px] text-muted-foreground">
              Pick one close to your business, then edit it to match. This is
              free and nothing is saved until you click Save Knowledge Base.
            </DialogDescription>
          </DialogHeader>

          {/* Flex rather than grid so the same min-h-0 chain works stacked on
              mobile and side by side on desktop. min-h-0 is what lets these
              panes shrink below their content, which is what keeps the footer
              on screen; a min-height floor here would clip it again. */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 sm:flex-row">
            {/* radiogroup rather than six buttons: these are mutually exclusive
                options, and arrow-key navigation between them comes for free. */}
            <div
              role="radiogroup"
              aria-label="Example knowledge bases"
              className="flex max-h-[26vh] min-h-0 shrink-0 flex-col gap-2 overflow-y-auto pr-1 sm:max-h-none sm:w-[260px]"
            >
              {KNOWLEDGE_BASE_EXAMPLES.map((example) => {
                const isSelected = example.id === selected.id;
                return (
                  <button
                    key={example.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedId(example.id)}
                    onDoubleClick={handleConfirm}
                    className={cn(
                      "flex items-start gap-3 rounded-[10px] border p-3 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/10"
                        : cn(
                            "border-border bg-card hover:bg-muted",
                            "dark:border-border dark:bg-background dark:hover:bg-muted/50",
                          ),
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border dark:border-muted-foreground/40",
                      )}
                      aria-hidden
                    >
                      {isSelected && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        {example.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {example.description}
                      </span>
                      {/* The user is about to drop ~1,800 characters into the
                          field, so say how much before they commit. */}
                      <span className="mt-1 block text-[11px] tabular-nums text-muted-foreground/70">
                        {example.text.length.toLocaleString()} characters
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <p className="mb-1.5 shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Preview
              </p>
              {/* Monospace to match the editor this lands in, so the preview
                  looks like the result. */}
              <pre
                className={cn(
                  "min-h-0 flex-1 overflow-y-auto rounded-[10px] p-3",
                  "font-mono text-xs leading-relaxed whitespace-pre-wrap",
                  "border border-border bg-card text-foreground",
                  "dark:border-border dark:bg-background dark:text-foreground",
                )}
              >
                {selected.text}
              </pre>
            </div>
          </div>

          {hasExistingText && (
            <p className="flex shrink-0 items-start gap-1.5 text-xs text-amber-700 dark:text-amber-500">
              <AlertTriangle
                className="mt-px h-3.5 w-3.5 shrink-0"
                aria-hidden
              />
              This replaces what you&apos;ve already written. You can undo it
              afterwards.
            </p>
          )}

          <div className="flex shrink-0 flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              onClick={() => setOpen(false)}
              className={cn(
                "h-12 rounded-[10px] px-6 font-sans text-sm font-semibold shadow-none transition-colors",
                "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
                "dark:border-border dark:bg-muted dark:text-foreground dark:hover:bg-muted/70",
              )}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              className="h-12 rounded-[10px] bg-primary px-6 font-sans text-sm font-semibold text-primary-foreground shadow-none transition hover:brightness-[1.03]"
            >
              {hasExistingText ? "Replace my knowledge base" : "Use this example"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
