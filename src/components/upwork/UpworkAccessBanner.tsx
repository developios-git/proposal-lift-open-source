"use client";

import Link from "next/link";
import { Briefcase, ExternalLink, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UpworkAccessBannerProps = {
  /**
   * Whether the tenant's Upwork OAuth app (Client ID + Secret) is configured.
   * Drives which call-to-action the banner shows:
   *  - `false` → prompt the user to add credentials in Settings.
   *  - `true`  → prompt the user to connect (authorize) their Upwork account.
   */
  oauthReady: boolean;
  /** True while the OAuth redirect is in flight (connect state only). */
  connecting: boolean;
  /** Starts the Upwork OAuth flow (connect state only). */
  onConnect: () => void;
  /** Heading shown in the connect state (app configured, account not linked). */
  connectTitle: string;
  /** Sub-text shown in the connect state. */
  connectDescription: string;
  /** Extra classes for the wrapper (merged with the banner's own styles). */
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

/**
 * Amber banner shown on Jobs / Filters pages when the account isn't ready to
 * pull the Upwork feed. It differentiates the two blocking states so the user
 * always sees the correct next step.
 */
export function UpworkAccessBanner({
  oauthReady,
  connecting,
  onConnect,
  connectTitle,
  connectDescription,
  className,
  ...rest
}: UpworkAccessBannerProps) {
  // Upstream had a third state: a paid user with no credentials could connect
  // straight through a platform-owned Upwork app. There is no shared app here,
  // so credentials are the only route to a connection.
  const showConnect = oauthReady;
  return (
    <div
      className={cn(
        "mb-4 rounded-lg border border-amber-200/90 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/25",
        className,
      )}
      {...rest}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3 min-w-0">
          <Briefcase
            className="h-5 w-5 shrink-0 text-amber-800 dark:text-amber-400"
            aria-hidden
          />
          <div className="min-w-0">
            {oauthReady ? (
              <>
                <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                  {connectTitle}
                </p>
                <p className="text-xs text-amber-900/85 dark:text-amber-200/80 mt-0.5">
                  {connectDescription}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                  Add your Upwork API credentials
                </p>
                <p className="text-xs text-amber-900/85 dark:text-amber-200/80 mt-0.5">
                  Enter your Upwork app Client ID and Secret in Settings, then
                  connect your account to start syncing jobs.
                </p>
              </>
            )}
          </div>
        </div>
        {showConnect ? (
          <Button
            type="button"
            size="sm"
            className="shrink-0 bg-green-600 hover:bg-green-700 text-white"
            disabled={connecting}
            onClick={onConnect}
          >
            {connecting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            Connect Upwork Account
          </Button>
        ) : (
          <Button
            asChild
            size="sm"
            className="shrink-0 bg-green-600 hover:bg-green-700 text-white"
          >
            <Link href="/settings?tab=integrations">
              <Settings className="h-4 w-4 mr-2" />
              Add API credentials
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
