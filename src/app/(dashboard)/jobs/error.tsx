"use client";

import { DashboardErrorState } from "@/components/errors/DashboardErrorState";

export default function JobsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <DashboardErrorState error={error} reset={reset} segment="jobs" />;
}
