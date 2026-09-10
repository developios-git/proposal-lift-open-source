import { AlertCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { ExtensionConsent } from "./ExtensionConsent";
import { isAllowedExtensionRedirectUri } from "@/lib/extension/redirect-uri";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Extension sign-in consent screen.
 *
 * The extension opens this in a `chrome.identity.launchWebAuthFlow` window with
 * a `redirect_uri` pointing at Chrome's own sentinel host. On confirmation it
 * mints a one-time code and sends the browser there; Chrome intercepts, closes
 * the window, and hands the code to the extension.
 *
 * `redirect_uri` survives an unauthenticated detour because `src/proxy.ts` puts
 * the full path and query into `?next=`, and both the password and Google paths
 * honour it. There is deliberately no cookie fallback: one mechanism that works
 * for every sign-in method beats two that each work for one.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ redirect_uri?: string }>;
}) {
  const { redirect_uri: redirectUri } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already gates this route, so this is belt-and-braces — but it
  // rebuilds the same `next` so the two cannot disagree about where to return.
  if (!user) {
    const self = redirectUri
      ? `/extension/handoff?redirect_uri=${encodeURIComponent(redirectUri)}`
      : "/extension/handoff";
    redirect(`/login?next=${encodeURIComponent(self)}`);
  }

  if (!isAllowedExtensionRedirectUri(redirectUri)) {
    return (
      <Centered>
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="size-5" aria-hidden />
            </div>
            <h1 className="text-lg font-semibold">Can&apos;t connect</h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            This link did not come from a recognised ProposalLift extension, so
            no connection was started.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Start the connection from the extension&apos;s toolbar icon rather
            than by opening this page directly. If you are running an unpacked
            build, set{" "}
            <code className="font-mono text-xs">PUBLISHED_EXTENSION_ID</code> to
            its id.
          </p>
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <ExtensionConsent
        redirectUri={redirectUri}
        email={user.email ?? null}
      />
    </Centered>
  );
}

/** The handoff layout is metadata only, so this route owns its own framing. */
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {children}
    </div>
  );
}
