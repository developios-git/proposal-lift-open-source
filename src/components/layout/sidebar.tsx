"use client";

import { apiFetch } from "@/lib/api-fetch";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  FolderOpen,
  User,
  FileCode,
  FileText,
  SquarePen,
  Settings,
  Briefcase,
  X,
  SlidersHorizontal,
  Anchor,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  UserCircle2,
  Video,
  Rocket,
  Puzzle,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
};

type NavSection = {
  id: string;
  /** Omitted for the pinned top section, which needs no heading. */
  label?: string;
  items: NavItem[];
};

const NEW_PROPOSAL_HREF = "/proposals/new";

function isRouteActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  // "New proposal" is its own action, so it must not light up the history list.
  if (href === "/proposals" && pathname === NEW_PROPOSAL_HREF) return false;
  if (href === "/profile/edit") {
    return pathname === "/profile/edit" || pathname.startsWith("/profile/");
  }
  // The per-filter feed lives at /filter/[id] but belongs to Job Filters.
  if (href === "/filters") {
    return pathname.startsWith("/filters") || pathname.startsWith("/filter/");
  }
  if (href === "/resources") return pathname === "/resources";
  return pathname.startsWith(href);
}

/** Sits on the seam between sidebar and main content (half in each). Desktop only. */
function DesktopSidebarToggle() {
  const { toggleSidebar, state } = useSidebar();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      data-sidebar="trigger"
      className={cn(
        "pointer-events-auto absolute right-0 top-1/2 z-60 hidden size-8 -translate-y-1/2 translate-x-1/2 cursor-pointer rounded-full shadow-md md:inline-flex",
        "border-border/80 bg-background text-foreground",
        "opacity-0 transition-opacity duration-200 group-hover:opacity-100",
        // Neutral hover: --accent is the lime brand colour, which reads as a
        // primary action rather than a chrome control. Both values must be
        // opaque, since this replaces bg-background rather than layering over it.
        "hover:bg-neutral-200 hover:text-foreground dark:hover:bg-neutral-700",
      )}
      onClick={toggleSidebar}
      aria-label={state === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
    >
      {state === "expanded" ? (
        <ChevronLeft className="size-4" aria-hidden />
      ) : (
        <ChevronRight className="size-4" aria-hidden />
      )}
    </Button>
  );
}

/**
 * The single primary action in the sidebar.
 *
 * Active nav rows are already a filled lime pill, so this is separated by form
 * rather than colour: its own zone above the scroll area, taller, and carrying a
 * soft glow no nav row has.
 *
 * Upstream it also had a credits-aware disabled state that dropped it to an
 * outline at zero balance. There is no balance here — generation is limited only
 * by the user's own API key — so it is always enabled.
 */
function NewProposalAction({ onNavigate }: { onNavigate: () => void }) {
  const { state, isMobile } = useSidebar();

  const label = (
    <>
      <SquarePen className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 truncate group-data-[collapsible=icon]:hidden">
        New proposal
      </span>
    </>
  );

  return (
    <div className="px-2 pb-3 pt-1 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            asChild
            className={cn(
              "h-10 w-full gap-2 rounded-lg text-sm font-semibold",
              "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:shadow-none",
              "shadow-[0_4px_16px_-6px_rgba(177,209,48,0.65)]",
            )}
          >
            <Link href={NEW_PROPOSAL_HREF} onClick={onNavigate}>
              {label}
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="center"
          hidden={state !== "collapsed" || isMobile}
        >
          New proposal
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function NavRow({
  item,
  active,
  onNavigate,
  badge,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
  badge?: React.ReactNode;
}) {
  const Icon = item.icon;

  const label = (
    <>
      <Icon />
      <span className="min-w-0 truncate">{item.label}</span>
      {item.external && (
        <span className="ml-auto flex size-3.5 shrink-0 items-center justify-center opacity-50">
          <ArrowUpRight className="size-3.5" aria-hidden />
        </span>
      )}
    </>
  );

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        {item.external ? (
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onNavigate}
          >
            {label}
          </a>
        ) : (
          <Link href={item.href} onClick={onNavigate}>
            {label}
          </Link>
        )}
      </SidebarMenuButton>
      {badge}
    </SidebarMenuItem>
  );
}

/**
 * Upstream this took five props. Four were billing or org gates — team-page
 * access, billing access, a deletion grace period, and an expired-trial lock
 * that greyed every row — and none survive. `lockCollapsed` is a layout concern,
 * not a gate, so it stays: /filter/[id] pins the rail to icons because that page
 * already spends 280–420px on its own filter sidebar.
 */
export function DashboardSidebar({
  lockCollapsed = false,
}: {
  /** Pins the rail to icons-only on desktop and hides the expand/collapse control. */
  lockCollapsed?: boolean;
} = {}) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  const [setupStatus, setSetupStatus] = useState<{
    completedCount: number;
    totalCount: number;
  } | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await apiFetch("/api/getting-started/status");
        if (res.ok) {
          const data = (await res.json()) as {
            completedCount: number;
            totalCount: number;
          };
          setSetupStatus(data);
        }
      } catch {
        // Fail silently — the badge simply won't show.
      }
    };
    void run();
  }, [pathname]);

  const isSetupComplete =
    setupStatus !== null && setupStatus.completedCount >= setupStatus.totalCount;

  /**
   * Ordered by how often a row is used, not by feature parity: the daily loop
   * sits at the top, the material it draws from in the middle, and account
   * settings at the bottom where they are predictable rather than prominent.
   */
  const sections = useMemo<NavSection[]>(
    () => [
      {
        id: "overview",
        items: [
          ...(isSetupComplete
            ? []
            : [
                {
                  label: "Get Started",
                  href: "/getting-started",
                  icon: Rocket,
                },
              ]),
          { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        ],
      },
      {
        id: "find-work",
        label: "Find work",
        items: [
          { label: "Job Feed", href: "/jobs", icon: Briefcase },
          { label: "Job Filters", href: "/filters", icon: SlidersHorizontal },
          { label: "Proposals", href: "/proposals", icon: FileText },
        ],
      },
      {
        id: "library",
        label: "Library",
        items: [
          { label: "Portfolio", href: "/portfolios", icon: FolderOpen },
          // Upstream: /team/personas — personas were a team-shared resource.
          { label: "Personas", href: "/personas", icon: UserCircle2 },
          { label: "Templates", href: "/templates", icon: FileCode },
          { label: "Hooks", href: "/hooks", icon: Anchor },
        ],
      },
      {
        id: "account",
        label: "Account",
        items: [{ label: "Profile", href: "/profile/edit", icon: User }],
      },
    ],
    [isSetupComplete],
  );

  /**
   * Upstream's "Extension" row linked straight out to the commercial build on
   * the Chrome Web Store, which is compiled against the commercial Supabase
   * project — a self-hoster who installed it would be pointing their browser at
   * someone else's backend. This one goes to a page on this instance instead,
   * which is the condition that had to be met before it could come back: it
   * hands you this server's own address and checks this account's readiness
   * before sending anyone to a store listing.
   */
  const footerItems = useMemo<NavItem[]>(
    () => [
      { label: "Resources", href: "/resources", icon: Video },
      { label: "Extension", href: "/extension", icon: Puzzle },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
    [],
  );

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="group z-50 border-sidebar-border">
      <SidebarHeader className="relative overflow-visible border-b border-sidebar-border p-0">
        <div
          className={cn(
            "flex h-16 w-full min-w-0 items-center gap-2 overflow-hidden",
            "justify-start px-3 py-2",
            "mb-2 border-b border-sidebar-border group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2",
          )}
        >
          <Link
            href="/dashboard"
            onClick={closeMobile}
            aria-label="ProposalLift home"
            className={cn(
              "mt-2 flex min-w-0 items-center rounded-lg py-1",
              "group-data-[collapsible=icon]:flex-none",
            )}
          >
            <Image
              src="/LogoIcon.png"
              alt=""
              width={100}
              height={100}
              className="size-[55px] w-auto shrink-0 group-data-[collapsible=icon]:hidden"
              priority
            />
            {/*
              text-white is safe here specifically: --sidebar is near-black in
              BOTH themes, so this never sits on a light surface.
              "Lift" uses text-sidebar-primary, not text-primary — globals.css
              overrides .text-primary to near-black (the lime is too light to
              read on white), which would make it invisible on this dark rail.
            */}
            <span
              className="min-w-0 truncate font-bold tracking-normal group-data-[collapsible=icon]:hidden"
              aria-hidden
            >
              <span className="text-2xl text-white">Proposal</span>
              <span className="text-2xl text-sidebar-primary">Lift</span>
            </span>
            <Image
              src="/LogoIcon.png"
              alt=""
              width={56}
              height={56}
              className="hidden size-[50px] shrink-0 rounded-lg object-cover group-data-[collapsible=icon]:block"
            />
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto shrink-0 md:hidden"
            onClick={() => setOpenMobile(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        {!lockCollapsed && <DesktopSidebarToggle />}
      </SidebarHeader>

      <NewProposalAction onNavigate={closeMobile} />

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.id} className="px-2 py-1">
            {section.label && (
              <SidebarGroupLabel className="h-7 text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/55 group-data-[collapsible=icon]:-mt-7">
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarMenu className="group-data-[collapsible=icon]:items-center">
              {section.items.map((item) => (
                <NavRow
                  key={item.href}
                  item={item}
                  active={isRouteActive(pathname, item.href)}
                  onNavigate={closeMobile}
                  badge={
                    item.href === "/getting-started" &&
                    setupStatus &&
                    setupStatus.completedCount < setupStatus.totalCount ? (
                      <SidebarMenuBadge>
                        {setupStatus.totalCount - setupStatus.completedCount}
                      </SidebarMenuBadge>
                    ) : undefined
                  }
                />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          {footerItems.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              active={isRouteActive(pathname, item.href)}
              onNavigate={closeMobile}
            />
          ))}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
