"use client";

import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Wraps a disabled action in a tooltip explaining why it is unavailable.
 *
 * Pass `reason: null` when the action is available and the children render
 * untouched, so a caller can wrap unconditionally.
 *
 * The `<span className="inline-flex">` is load-bearing: a disabled button emits
 * no pointer events, so Radix would never see the hover and the tooltip would
 * never open. The span is the actual trigger and stays interactive. This
 * mirrors the "Add filter" gate on the filters page.
 */
export function UpworkImportGate({
  reason,
  children,
}: {
  reason: string | null;
  children: ReactNode;
}) {
  if (!reason) return <>{children}</>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{children}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{reason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
