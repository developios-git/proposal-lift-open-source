"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Puzzle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";

/**
 * The consent step of extension sign-in.
 *
 * **The click is load-bearing.** Upstream's version fired on mount, inside a
 * `useEffect`, with no interaction at all. A page that mints a credential and
 * hands it onwards the moment it loads is CSRF-shaped: anything that can make a
 * signed-in user's browser visit a URL can make it mint a session. Requiring a
 * press means a visit produces a page, not a token.
 *
 * `redirectUri` has already been validated on the server against the known
 * extension id. Nothing here re-derives it, and nothing here accepts one from
 * the client.
 */
export function ExtensionConsent({
  redirectUri,
  email,
}: {
  redirectUri: string;
  email: string | null;
}) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setError(null);
    setConnecting(true);
    try {
      const res = await apiFetch("/api/extension/handoff/create", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || typeof data.handoff_id !== "string") {
        setError(
          data.error || "Could not start the connection. Please try again.",
        );
        setConnecting(false);
        return;
      }

      // A full navigation, not router.push: this leaves the app for Chrome's
      // sentinel URL, which the extension is waiting on. Staying in the SPA
      // router would never hand control back to the browser.
      //
      // The lint rule below assumes a relative, in-app destination. This one is
      // an absolute external origin (https://<id>.chromiumapp.org/), so the
      // suggested router.push() would navigate nowhere.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `${redirectUri}?code=${encodeURIComponent(data.handoff_id)}`;
    } catch {
      setError("Could not reach the server. Please try again.");
      setConnecting(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Puzzle className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Connect the extension?</h1>
          {email ? (
            <p className="truncate text-sm text-muted-foreground">{email}</p>
          ) : null}
        </div>
      </div>

      <p className="mt-5 text-sm text-muted-foreground">
        The ProposalLift browser extension will be able to:
      </p>
      <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
        <li>• Read your personas, templates and hooks</li>
        <li>• Generate and refine proposals as you</li>
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">
        It stays signed in until you sign out from the extension. You can do that
        any time from its toolbar icon.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="ghost" asChild disabled={connecting}>
          <a href="/dashboard">Cancel</a>
        </Button>
        <Button onClick={connect} disabled={connecting}>
          {connecting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Connecting…
            </>
          ) : (
            "Connect"
          )}
        </Button>
      </div>
    </div>
  );
}
