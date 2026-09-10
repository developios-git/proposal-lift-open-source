"use client";

import { DashboardErrorState } from "@/components/errors/DashboardErrorState";

export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <DashboardErrorState error={error} reset={reset} segment="personas" />;
}
