"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  EXTENSION_ISSUES,
  EXTENSION_STEPS,
  type ExtensionStep,
} from "@/lib/extension/guide-content";
import {
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  ExternalLink,
} from "lucide-react";

/**
 * Nothing subscribes: the origin cannot change without a navigation. Module
 * scope so the reference is stable across renders.
 */
const subscribeToNothing = () => () => {};

type Readiness = {
  hasApiKey: boolean;
  personaCount: number;
  usablePersonaCount: number;
};

/**
 * One sentence saying whether the panel will be able to write, and if not, what
 * is missing. Split out because the persona case has three outcomes rather than
 * two — "you have none" and "you have some, none complete enough" need
 * different advice, which is the same distinction `/api/extension/catalog`
 * preserves for the panel itself.
 */
function readinessSummary({
  hasApiKey,
  personaCount,
  usablePersonaCount,
}: Readiness): string {
  if (!hasApiKey && personaCount === 0) {
    return "Save an OpenAI key and build a persona, and the panel will be ready to write.";
  }
  if (!hasApiKey) {
    return "Save an OpenAI key before you connect. The panel cannot write without one.";
  }
  if (usablePersonaCount === 0 && personaCount > 0) {
    return `Your key is saved, but none of your ${personaCount} personas is complete enough for the panel to offer yet.`;
  }
  if (usablePersonaCount === 0) {
    return "Your key is saved. Build a persona and the panel will have someone to write as.";
  }
  return "Your key and personas are ready. The panel can write as soon as you connect it.";
}

/** The inline status a checked step shows beside its title. */
function stepStatus(
  check: ExtensionStep["check"],
  { hasApiKey, personaCount, usablePersonaCount }: Readiness,
): { done: boolean; label: string } | null {
  if (check === "api-key") {
    return hasApiKey
      ? { done: true, label: "Saved" }
      : { done: false, label: "Not saved yet" };
  }
  if (check === "persona") {
    if (usablePersonaCount > 0) {
      return {
        done: true,
        label:
          usablePersonaCount === 1
            ? "1 persona ready"
            : `${usablePersonaCount} personas ready`,
      };
    }
    return {
      done: false,
      label: personaCount > 0 ? "None complete enough" : "None yet",
    };
  }
  return null;
}

export default function ExtensionGuide({
  webStoreUrl,
  hasApiKey,
  personaCount,
  usablePersonaCount,
}: {
  /** The Chrome Web Store listing, or null while the extension is unpublished. */
  webStoreUrl: string | null;
} & Readiness) {
  const readiness = { hasApiKey, personaCount, usablePersonaCount };
  const reduceMotion = useReducedMotion();

  /**
   * The address to hand the extension is the one this page was served from,
   * which beats reading `NEXT_PUBLIC_APP_URL`: the extension reaches the server
   * the same way the browser just did, so a self-hoster who never set that
   * variable still sees a correct value rather than a default pointing at
   * localhost.
   *
   * `useSyncExternalStore` rather than an effect because there is no `window`
   * during prerender. The server snapshot is empty, so the markup agrees on
   * both sides and React fills in the real origin after hydration.
   */
  const serverOrigin = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => "",
  );

  const [copied, setCopied] = useState(false);

  const copyOrigin = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(serverOrigin);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Please copy manually.");
    }
  }, [serverOrigin]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <header>
        <h1 className="font-heading text-2xl font-normal tracking-normal">
          Chrome extension
        </h1>
        <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
          Write proposals inside Upwork&apos;s own apply page, against this
          server, using your key and your portfolio.
        </p>
      </header>

      {/* The one loud element on the page, and the only thing here that a file
          in the repository could not tell you: the address of the instance you
          are looking at, and whether it is ready to be used. Dark because the
          sidebar is dark in both themes, so this reads as the app describing
          itself rather than as decoration. */}
      <section className="rounded-2xl bg-sidebar p-6 text-sidebar-foreground sm:p-8">
        <h2 className="text-sm text-sidebar-foreground/60">
          The address to give the extension
        </h2>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate font-mono text-xl tracking-tight sm:text-2xl">
            {serverOrigin || "…"}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void copyOrigin()}
            disabled={!serverOrigin}
            aria-label={copied ? "Copied" : "Copy this server's address"}
            className="shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
        <p className="mt-5 max-w-[60ch] text-sm text-sidebar-foreground/70">
          {readinessSummary(readiness)}
        </p>
      </section>

      <ol className="flex flex-col">
        {EXTENSION_STEPS.map((step, index) => {
          const isLast = index === EXTENSION_STEPS.length - 1;
          const status = stepStatus(step.check, readiness);

          return (
            <li key={step.title} className="flex gap-4">
              {/* The badge, and the spine hanging below it. The line is a flex
                  child of a full-height column, so it sizes itself to whatever
                  the step beside it turns out to be. */}
              <div className="flex flex-col items-center">
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-sm font-medium tabular-nums"
                >
                  {index + 1}
                </span>
                {!isLast && (
                  <motion.span
                    aria-hidden
                    className="w-px flex-1 origin-top bg-border"
                    initial={{ scaleY: reduceMotion ? 1 : 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{
                      duration: reduceMotion ? 0 : 0.3,
                      ease: "easeOut",
                      delay: reduceMotion ? 0 : 0.15 + index * 0.07,
                    }}
                  />
                )}
              </div>

              <div className={cn("min-w-0 flex-1 pt-1", !isLast && "pb-8")}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="text-base font-semibold">{step.title}</h2>
                  {status && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs",
                        status.done
                          ? "text-muted-foreground"
                          : "text-destructive",
                      )}
                    >
                      {status.done ? (
                        <Check className="size-3.5" aria-hidden />
                      ) : (
                        <CircleAlert className="size-3.5" aria-hidden />
                      )}
                      {status.label}
                    </span>
                  )}
                </div>

                <p className="mt-1.5 max-w-[68ch] text-sm text-muted-foreground">
                  {step.body}
                </p>

                {/* No button until the listing exists. The step still reads
                    correctly without one, and a dead link is worse than
                    none. */}
                {step.kind === "install" && webStoreUrl && (
                  <Button asChild size="sm" className="mt-3">
                    <a
                      href={webStoreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Install from the Chrome Web Store
                      <ExternalLink aria-hidden />
                    </a>
                  </Button>
                )}

                {step.kind === "server-url" && (
                  <code className="mt-3 inline-block rounded bg-muted px-2 py-1 font-mono text-xs">
                    {serverOrigin || "…"}
                  </code>
                )}

                {step.link && (
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link href={step.link.href}>{step.link.label}</Link>
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-xl font-normal">When it goes wrong</h2>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {EXTENSION_ISSUES.map((issue) => (
            <details key={issue.symptom} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-4 text-sm font-medium hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
                  aria-hidden
                />
                {issue.symptom}
              </summary>
              <p className="max-w-[68ch] px-4 pb-4 pl-11 text-sm text-muted-foreground">
                {issue.fix}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
