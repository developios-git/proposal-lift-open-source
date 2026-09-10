import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "The page you're looking for doesn't exist or may have been moved.",
};

/**
 * Upstream this rendered a marketing-shell 404 with the landing nav, footer and
 * a link to the blog. None of that exists here, so this is a plain in-app 404
 * built from theme tokens.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 text-center">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.45] dark:opacity-30"
        aria-hidden
        style={{
          backgroundImage: `
            linear-gradient(to right, color-mix(in oklch, var(--foreground) 12%, transparent) 1px, transparent 1px),
            linear-gradient(to bottom, color-mix(in oklch, var(--foreground) 12%, transparent) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
          maskImage:
            "radial-gradient(ellipse 70% 55% at 50% 45%, black 20%, transparent 70%)",
        }}
      />

      <div className="relative z-10 flex max-w-xl flex-col items-center gap-8">
        <p className="bg-linear-to-b from-primary via-primary/45 to-background bg-clip-text text-[clamp(4.5rem,22vw,12.5rem)] font-bold leading-[0.9] tracking-tight text-transparent">
          404
        </p>

        <div className="flex flex-col items-center gap-4">
          <h1 className="text-balance text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">
            Page not found
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            The page you&rsquo;re looking for doesn&rsquo;t exist or may have
            been moved.
          </p>
        </div>

        <div className="flex w-full max-w-md flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
          <Button asChild size="lg">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/filters">Job filters</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
