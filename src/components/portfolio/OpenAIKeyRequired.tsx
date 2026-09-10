import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Shown wherever adding portfolio work is blocked because no OpenAI key is
 * saved.
 *
 * A project is matched to a job by meaning, using an embedding generated with
 * the user's own key. Without one the row would exist and never reach a
 * proposal, so the key is a prerequisite rather than a warning after the fact.
 *
 * Two shapes, one wording, so the list page and the create page cannot drift
 * apart on what the user is being asked to do.
 */
export function OpenAIKeyRequired({
  variant = "page",
  className,
}: {
  /** `page` replaces a form; `banner` sits above a list that still renders. */
  variant?: "page" | "banner";
  className?: string;
}) {
  const body = (
    <>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
          variant === "page" ? "size-12" : "size-9",
        )}
      >
        <KeyRound className={variant === "page" ? "size-6" : "size-4"} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            "font-semibold text-foreground",
            variant === "page" ? "text-lg" : "text-sm",
          )}
        >
          Add your OpenAI API key first
        </p>
        <p className="text-sm text-muted-foreground">
          Portfolio projects are matched to jobs by meaning, which needs an
          embedding generated with your own OpenAI key. Save one and you can add
          work straight away.
        </p>
      </div>
      <Link
        href="/settings?tab=ai-models"
        className={cn("shrink-0", variant === "page" && "sm:self-center")}
      >
        <Button size={variant === "page" ? "default" : "sm"}>
          Go to Settings
        </Button>
      </Link>
    </>
  );

  if (variant === "banner") {
    return (
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border border-amber-200/90 bg-amber-50 p-4 sm:flex-row sm:items-center dark:border-amber-900/40 dark:bg-amber-950/25",
          className,
        )}
      >
        {body}
      </div>
    );
  }

  return (
    <Card className={cn("mx-auto w-full max-w-2xl", className)}>
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
        {body}
      </CardContent>
    </Card>
  );
}
