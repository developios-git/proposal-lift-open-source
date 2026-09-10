import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign up - ProposalLift",
  description: "Create your ProposalLift account",
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
