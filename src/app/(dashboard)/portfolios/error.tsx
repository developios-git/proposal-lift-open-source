"use client";

import { DashboardErrorState } from "@/components/errors/DashboardErrorState";

export default function PortfoliosError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DashboardErrorState error={error} reset={reset} segment="portfolios" />
  );
}
