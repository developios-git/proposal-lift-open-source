"use client";

import { DashboardSidebar } from "@/components/layout/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { usePresencePing } from "@/lib/presence/usePresencePing";

/** Stable identity so SidebarProvider's memo isn't invalidated every render. */
const NOOP = () => {};

/**
 * Shell for /filter/[id].
 *
 * Same nav as the dashboard, but the rail is pinned to icons and cannot be
 * expanded — this page already spends 280–420px on its own filter sidebar, so a
 * second full-width nav column would leave no room for the job list.
 *
 * Because `open` is controlled here, `SidebarProvider` never writes its
 * `sidebar_state` cookie from this page, so the dashboard's expanded default is
 * untouched.
 *
 * On mobile the sidebar renders as a Sheet (see ui/sidebar), opened by the
 * `SidebarTrigger` in the jobs header. The filter drawer keeps its own button,
 * so the two panels are separate and never open together.
 */
export default function FilterPageShell({
  children,
}: {
  children: React.ReactNode;
}) {
  usePresencePing();

  return (
    <SidebarProvider
      // Controlled and pinned shut: on this page the rail is icons-only and
      // cannot be expanded. Mobile is unaffected — the Sheet uses `openMobile`,
      // which is separate state.
      open={false}
      onOpenChange={NOOP}
      className="h-svh max-h-svh min-h-0 overflow-hidden"
      // Match the dashboard: these surfaces sit on white, not the warm-gray --background
      style={{ "--background": "var(--card)" } as React.CSSProperties}
    >
      <DashboardSidebar lockCollapsed />
      <SidebarInset className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
