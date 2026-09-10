"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Settings, LogOut, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useShallow } from "zustand/react/shallow";

/**
 * Upstream this had an `admin` variant pointing at /control-panel/settings, a
 * `trialLocked` prop, and a pending-deletion state that greyed out Settings.
 * None of those exist here.
 */
export function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { profile, user, signOut } = useAuthStore(
    useShallow((state) => ({
      profile: state.profile,
      user: state.user,
      signOut: state.signOut,
    })),
  );
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsOpen(false);
    try {
      await signOut();
      // Brief delay to let Supabase release its auth lock before navigating.
      await new Promise((r) => setTimeout(r, 150));
      router.push("/login");
      router.refresh();
    } catch {
      // Navigate anyway; the session may already be cleared.
      router.push("/login");
      router.refresh();
    }
  };

  const displayName =
    profile?.full_name || user?.email?.split("@")[0] || "User";
  const firstName = displayName.trim().split(/\s+/)[0] || displayName;
  const displayEmail = user?.email || "";
  const initials =
    displayName
      .trim()
      .split(/\s+/)
      .filter((n: string) => n.length > 0)
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 py-4.5 transition-colors hover:bg-muted"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-accent">
          {profile?.avatar_url ? (
            // Plain <img>: avatars come from arbitrary remote hosts (Upwork,
            // Google), which next/image would need every domain allow-listed for.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            // text-primary is near-black here (globals.css overrides it), which
            // is what makes it readable on the lime bg-accent.
            <span className="text-xs font-bold text-primary">{initials}</span>
          )}
        </div>
        <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">
          {firstName}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </Button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border bg-background shadow-lg">
          <div className="border-b p-4">
            <p className="text-sm font-semibold">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {displayEmail}
            </p>
          </div>

          <div className="py-2">
            <Link
              href="/settings"
              className="flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-muted"
              onClick={() => setIsOpen(false)}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>

            <div className="my-2 border-t" />

            <button
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-destructive transition-colors hover:bg-muted"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
