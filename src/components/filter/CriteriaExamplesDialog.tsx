"use client";

import { useState } from "react";
import { AlertTriangle, BookOpen, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  QUALIFY_CRITERIA_EXAMPLES,
  type QualifyCriteriaExample,
} from "@/lib/jobs/qualify/criteria-examples";

export interface CriteriaExamplesDialogProps {
  /** Drives the overwrite warning and the confirm button's wording. */
  hasExistingText: boolean;
  /** Called with the chosen example's text. The caller snapshots for undo. */
  onSelect: (text: string) => void;
  disabled?: boolean;
}

const FIRST = QUALIFY_CRITERIA_EXAMPLES[0];

/**
 * "Examples" affordance for the Qualify criteria field: pick a starting point,
 * preview it, then confirm.
 *
 * Selecting does not insert — confirming does. This overwrites text the user may
 * have spent real time on, so it takes one deliberate step, and the preview pane
 * lets them compare all three before committing. Picking an example costs
 * nothing and calls no model; the strings are static.
 */
export function CriteriaExamplesDialog({
  hasExistingText,
  onSelect,
  disabled = false,
}: CriteriaExamplesDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(FIRST.id);

  const selected: QualifyCriteriaExample =
    QUALIFY_CRITERIA_EXAMPLES.find((e) => e.id === selectedId) ?? FIRST;

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
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-7 gap-1.5 px-2 text-[11px]"
        >
          <BookOpen className="h-3 w-3" />
          Examples
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Example criteria</DialogTitle>
          <DialogDescription>
            Pick a starting point, then edit it to match your own work. This is
            free — nothing is saved until you save your criteria.
          </DialogDescription>
        </DialogHeader>

        {/* radiogroup rather than three buttons: these are mutually exclusive
            options, and arrow-key navigation between them comes for free. */}
        <div
          role="radiogroup"
          aria-label="Example criteria"
          className="mt-4 flex flex-col gap-2"
        >
          {QUALIFY_CRITERIA_EXAMPLES.map((example) => {
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
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40",
                  )}
                  aria-hidden
                >
                  {isSelected && <Check className="h-2.5 w-2.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {example.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {example.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Preview
          </p>
          <pre className="max-h-[220px] overflow-y-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
            {selected.text}
          </pre>
        </div>

        {hasExistingText && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            This replaces what you&apos;ve already written. You can undo it
            afterwards.
          </p>
        )}

        <DialogFooter className="mt-5">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm}>
            {hasExistingText ? "Replace my criteria" : "Use this example"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
