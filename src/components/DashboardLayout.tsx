"use client";

import { DashboardSidebar } from "@/components/layout/sidebar";
import { UserDropdown } from "@/components/layout/user-dropdown";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { usePresencePing } from "@/lib/presence/usePresencePing";

/**
 * Upstream this took seven props, every one of them a billing or org lock:
 * team-page access, billing access, a past-due subscriber lock that hid the
 * sidebar entirely, an expired-trial lock that greyed every link, and the
 * deletion grace period. None of those states exist here, so the shell takes
 * only its children.
 */
export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  usePresencePing();

  return (
    <SidebarProvider
      defaultOpen
      className="h-svh max-h-svh min-h-0 overflow-hidden"
      // Dashboard surfaces sit on white, not the global warm-gray --background
      style={{ "--background": "var(--card)" } as React.CSSProperties}
    >
      <DashboardSidebar />
      <SidebarInset className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b bg-background px-4 md:px-8">
            <SidebarTrigger className="lg:hidden" />

            <div className="hidden lg:block" />

            <div className="flex items-center gap-3">
              <UserDropdown />
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col bg-background p-4 md:p-8">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
