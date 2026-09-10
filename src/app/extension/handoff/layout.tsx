import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Extension sign-in",
  description:
    "Complete Chrome extension authentication for ProposalLift on Upwork.",
};

export default function ExtensionHandoffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
