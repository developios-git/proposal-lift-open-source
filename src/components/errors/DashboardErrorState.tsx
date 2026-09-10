"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared body for every route-segment error boundary under the dashboard.
 *
 * Upstream this reported to Sentry with the segment as a tag. There is no
 * telemetry here, so the segment is logged to the console instead — it is still
 * the thing that tells a self-hoster which route blew up.
 */
export function DashboardErrorState({
  error,
  reset,
  segment,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  segment: string;
}) {
  useEffect(() => {
    console.error(`[route-error] segment=${segment}`, error);
  }, [error, segment]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" aria-hidden />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-semibold tracking-normal text-foreground">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground">
          Try again, or head back to the dashboard. Details are in the browser
          console and your server logs.
        </p>
        {error.digest && (
          <p className="pt-1 font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
