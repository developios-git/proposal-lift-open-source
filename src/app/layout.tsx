import type { Metadata } from "next";
// SVG country flags (`fi fi-us`), used by the job feed's client-location badges.
// Imported before globals.css so Tailwind's layers are emitted after it. Swap
// the order and utility classes lose to flag-icons' own rules.
import "flag-icons/css/flag-icons.min.css";
import "./globals.css";
import { Toaster } from "sonner";

/*
 * Fonts are loaded via @fontsource imports in globals.css, not next/font/google.
 * next/font/google fetches from fonts.googleapis.com during `next build`, so it
 * fails the Docker build, offline builds, and builds behind restrictive
 * networks. See globals.css for the font tokens.
 */

export const metadata: Metadata = {
  // Derived, never hardcoded: a fixed domain would make every self-hoster's
  // canonical and OG URLs point at someone else's instance.
  // `||`, not `??`: a blank .env value arrives as "", and new URL("") throws.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  title: {
    default: "ProposalLift",
    template: "%s | ProposalLift",
  },
  description:
    "Self-hosted AI proposal generator for Upwork freelancers. Pull live job feeds and generate tailored proposals from your own portfolio.",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
