import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared full-page card frame used by login-style flows (grid background,
 * ProposalLift branding). Keeps secondary routes visually aligned with login.
 */
export function BrandedSessionShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div className="absolute inset-0 z-0">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="branded-session-grid"
              width="60"
              height="60"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 60 0 L 0 0 0 60"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-border/30"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#branded-session-grid)" />
        </svg>
      </div>

      <div className="absolute right-1/4 top-1/4 h-[300px] w-[300px] rounded-full bg-accent/20 blur-3xl" />

      <div className="relative z-10 w-full max-w-md space-y-8 rounded-2xl border bg-card p-10 shadow-2xl">
        <div className="text-center">
          <Link
            href="/"
            aria-label="ProposalLift home"
            className="mx-auto flex items-center justify-center transition-opacity hover:opacity-80"
          >
            <Image
              src="/LogoIcon.png"
              alt=""
              width={100}
              height={100}
              className="size-[55px] w-auto object-contain shrink-0"
              priority
            />
            {/* `text-foreground`, not a hardcoded black: the card is dark in dark
                mode, where black-on-dark is unreadable. */}
            <div className="font-bold tracking-normal">
              <span className="text-2xl text-foreground">Proposal</span>
              <span className="text-2xl text-primary">Lift</span>
            </div>
          </Link>
          <p className="text-sm text-muted-foreground">AI proposals for Upwork</p>
        </div>
        {children}
      </div>
    </div>
  );
}
