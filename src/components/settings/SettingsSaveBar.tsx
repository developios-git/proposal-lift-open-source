"use client";

/**
 * The save affordance for a settings tab, pinned to the bottom of the scroll
 * area instead of buried under the form.
 *
 * The AI Models and Knowledge Base tabs are long — on a 557px-tall viewport the
 * old in-card footer button sat at y=1435, roughly two and a half screens down.
 * Users edited a model or a note, saw no way to commit it, and left the tab
 * assuming it had saved itself. A control you have to go looking for is one
 * people do not know exists.
 *
 * Deliberately always rendered rather than only while dirty. Appearing on the
 * first keystroke would fix reachability but not discoverability: the point is
 * that someone arriving on the tab can see up front that this screen is saved
 * explicitly, and where. Disabled-until-dirty carries that without nagging.
 *
 * `sticky bottom-0` rather than `fixed`: the tab content is the scroll
 * container, so sticky keeps the bar inside that column and lets it come to
 * rest at the end of the content instead of hovering over the page forever.
 */

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SettingsSaveBarProps = {
  /** Whether there is anything to save; drives both the label and the button. */
  isDirty: boolean;
  saving: boolean;
  onSave: () => void;
  /** Button text at rest, e.g. "Save" or "Save Knowledge Base". */
  saveLabel: string;
  savingLabel?: string;
  /** Secondary actions (Clear, Reset) rendered before the primary button. */
  children?: ReactNode;
  className?: string;
};

export function SettingsSaveBar({
  isDirty,
  saving,
  onSave,
  saveLabel,
  savingLabel = "Saving...",
  children,
  className,
}: SettingsSaveBarProps) {
  return (
    <div
      className={cn(
        // The scroll container is `py-6`, and a stuck element aligns to its
        // *content* box — 24px short of the bottom, which left a strip of the
        // form visible below the bar and made it read as floating mid-page.
        // `-bottom-6` reaches down into that padding; `pb-6` paints it.
        "sticky -bottom-6 z-20 pt-6 pb-6",
        // Fades the form out as it scrolls beneath rather than letting it
        // collide with the bar's edge.
        "bg-linear-to-t from-background via-background to-transparent",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-end gap-3 rounded-xl border px-4 py-3",
          "bg-card shadow-lg",
          // An unsaved tab is worth catching the eye; a saved one is not.
          isDirty ? "border-primary/40" : "border-border",
        )}
      >
        <p
          className="mr-auto flex items-center gap-2 text-sm text-muted-foreground"
          // Someone mid-edit should hear that there is something to save
          // without the message interrupting them on every keystroke.
          aria-live="polite"
        >
          {isDirty ? (
            <>
              <span
                className="size-2 shrink-0 rounded-full bg-amber-500"
                aria-hidden
              />
              <span className="font-medium text-foreground">
                You have unsaved changes
              </span>
            </>
          ) : (
            <span>All changes saved</span>
          )}
        </p>

        {children}

        <Button
          type="button"
          onClick={onSave}
          disabled={!isDirty || saving}
          className="gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? savingLabel : saveLabel}
        </Button>
      </div>
    </div>
  );
}
