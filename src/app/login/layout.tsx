import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login - ProposalLift",
  description: "Sign in to your ProposalLift account",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
