"use client";

import { apiFetch } from "@/lib/api-fetch";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Loader2, Clock, Mail } from "lucide-react";
import { toast } from "sonner";
import { BrandedSessionShell } from "@/components/BrandedSessionShell";

type Status =
  | "loading"
  | "success"
  | "already_verified"
  | "error"
  | "expired"
  | "missing_token"
  | "signed_out"
  | "pending_email";

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const statusParam = searchParams.get("status");
  const emailParam = searchParams.get("email") ?? "";
  const messageParam = searchParams.get("message") ?? "";
  const rawNext = searchParams.get("next") ?? "";
  const nextUrl =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/login";

  const [bareStatus, setBareStatus] = useState<
    "loading" | "signed_out" | "pending_email"
  >("loading");

  const status: Status = statusParam
    ? statusParam === "success"
      ? "success"
      : statusParam === "already_verified"
        ? "already_verified"
        : statusParam === "expired"
          ? "expired"
          : statusParam === "missing_token"
            ? "missing_token"
            : statusParam === "failed"
              ? "error"
              : "loading"
    : bareStatus;

  const message =
    status === "error"
      ? messageParam || "Verification link is invalid or has expired."
      : "";

  useEffect(() => {
    if (statusParam !== "success") return;
    const timer = setTimeout(() => {
      router.push(nextUrl);
    }, 3000);
    return () => clearTimeout(timer);
  }, [statusParam, router, nextUrl]);

  /**
   * `/verify` with no `?status=`, resolve the session rather than spinning
   * forever. Upstream this also called /api/profile to read `account_state`;
   * `email_confirmed_at` is now the only thing that decides it.
   */
  useEffect(() => {
    if (statusParam) return;
    let cancelled = false;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session?.user) {
        setBareStatus("signed_out");
        return;
      }

      if (session.user.email_confirmed_at) {
        router.replace("/dashboard");
        return;
      }

      setBareStatus("pending_email");
    })();
    return () => {
      cancelled = true;
    };
  }, [statusParam, router]);

  return (
    <BrandedSessionShell>
      <div className="text-center">
        {status === "loading" && <LoadingState />}
        {status === "signed_out" && <SignedOutState />}
        {status === "pending_email" && <PendingEmailState />}
        {status === "success" && <SuccessState nextUrl={nextUrl} />}
        {status === "already_verified" && <AlreadyVerifiedState />}
        {status === "expired" && <ExpiredState initialEmail={emailParam} />}
        {status === "missing_token" && <MissingTokenState />}
        {status === "error" && <ErrorState message={message} />}
      </div>
    </BrandedSessionShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <BrandedSessionShell>
          <div className="text-center">
            <LoadingState />
          </div>
        </BrandedSessionShell>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}

function LoadingState() {
  return (
    <div className="mt-4 space-y-4">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border bg-muted">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Verifying your email...</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Please wait while we confirm your account.
        </p>
      </div>
    </div>
  );
}

function SignedOutState() {
  return (
    <div className="mt-4 space-y-4">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border bg-muted">
        <Mail className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">You&rsquo;re signed out</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with your email and password to continue.
        </p>
      </div>
      <Button asChild className="h-11 w-full">
        <Link href="/login">Go to login</Link>
      </Button>
    </div>
  );
}

function PendingEmailState() {
  return (
    <div className="mt-4 space-y-4">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10">
        <Mail className="h-8 w-8 text-amber-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Confirm your email</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a verification link to your inbox. Open it to confirm your
          account, then sign in.
        </p>
      </div>
      <Button asChild className="h-11 w-full">
        <Link href="/login">Go to login</Link>
      </Button>
    </div>
  );
}

function SuccessState({ nextUrl }: { nextUrl: string }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-green-500/20 bg-green-500/10">
        <CheckCircle2 className="h-8 w-8 text-green-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Email Verified!</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account has been confirmed. Redirecting you...
        </p>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-1 animate-[grow_3s_linear_forwards] rounded-full bg-green-500" />
      </div>
      <Button asChild variant="outline" className="h-11 w-full">
        <Link href={nextUrl}>Continue</Link>
      </Button>
    </div>
  );
}

function ExpiredState({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleResend = async () => {
    if (!email) {
      toast.error("Please enter your email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to resend verification email.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="mt-4 space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-green-500/20 bg-green-500/10">
          <Mail className="h-8 w-8 text-green-500" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Email Sent!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A new verification link has been sent to <strong>{email}</strong>.
            Please check your inbox.
          </p>
        </div>
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href="/login">Back to Login</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10">
        <Clock className="h-8 w-8 text-amber-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Link Expired</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your verification link has expired. Enter your email to receive a new
          one.
        </p>
      </div>
      <div className="space-y-3 text-left">
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11"
          disabled={loading}
        />
        <Button className="h-11 w-full" onClick={handleResend} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Mail className="mr-2 h-4 w-4" />
              Resend verification email
            </>
          )}
        </Button>
      </div>
      <Button asChild variant="outline" className="h-11 w-full">
        <Link href="/login">Back to Login</Link>
      </Button>
    </div>
  );
}

function AlreadyVerifiedState() {
  return (
    <div className="mt-4 space-y-4">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-green-500/20 bg-green-500/10">
        <CheckCircle2 className="h-8 w-8 text-green-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Already Verified</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your email is already verified. Sign in to continue.
        </p>
      </div>
      <Button asChild className="h-11 w-full">
        <Link href="/login">Continue to Login</Link>
      </Button>
    </div>
  );
}

function MissingTokenState() {
  return (
    <div className="mt-4 space-y-4">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border bg-muted">
        <Mail className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Incomplete link</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Please use the confirmation link from your email to verify your
          account.
        </p>
      </div>
      <Button asChild variant="outline" className="h-11 w-full">
        <Link href="/login">Back to Login</Link>
      </Button>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-destructive/20 bg-destructive/10">
        <XCircle className="h-8 w-8 text-destructive" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Verification Failed</h2>
        <p className="mt-2 text-sm text-destructive">{message}</p>
      </div>
      <Button asChild className="h-11 w-full">
        <Link href="/login">Back to Login</Link>
      </Button>
    </div>
  );
}
