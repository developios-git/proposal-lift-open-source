"use client";

import { apiFetch } from "@/lib/api-fetch";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  AuthDivider,
  GoogleAuthButton,
} from "@/components/auth/GoogleAuthButton";
import { startGoogleOAuth } from "@/lib/auth/start-google-oauth";

/**
 * Upstream this took a `PublicEntryMode` that chose between /signup and /apply
 * as the public entry point, and handled `reason=` codes for suspension,
 * invite-only rejection, and two org-billing lockouts. Signup is open here and
 * none of those states exist, so the only surviving `reason` is the
 * unverified-email resend prompt, which the login response drives directly.
 */
export function LoginPageClient({
  googleEnabled,
  next,
}: {
  googleEnabled: boolean;
  /** Sanitised destination from `?next=`, or null to route by account state. */
  next: string | null;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("reason")) return;
    // Strip a stale `reason` so a refresh doesn't re-show whatever it said.
    params.delete("reason");
    const q = params.toString();
    window.history.replaceState(
      null,
      "",
      q ? `${window.location.pathname}?${q}` : window.location.pathname,
    );
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCanResend(false);
    setResendSuccess(false);
    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Invalid credentials");
        if (data.canResend) setCanResend(true);
        return;
      }

      // An explicit destination wins; otherwise fall back to the account-state
      // routing the login endpoint worked out.
      const target =
        next ??
        (typeof data.redirectTo === "string" && data.redirectTo.startsWith("/")
          ? data.redirectTo
          : "/dashboard");
      router.push(target);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    setResendSuccess(false);
    try {
      const res = await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setResendSuccess(true);
        setCanResend(false);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to resend verification email.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const result = await startGoogleOAuth(next);
    if (!result.ok) toast.error(result.error);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* Geometric Background Pattern */}
      <div className="absolute inset-0 z-0">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="grid"
              width="60"
              height="60"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 60 0 L 0 0 0 60"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-border/30"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Accent Blob */}
      <div className="absolute right-1/4 top-1/4 h-[300px] w-[300px] rounded-full bg-accent/20 blur-3xl" />

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md space-y-8 rounded-2xl border bg-card p-10 shadow-2xl">
        {/* Logo & Header */}
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center">
            <Image
              src="/LogoIcon.png"
              alt=""
              width={100}
              height={100}
              className="size-[55px] w-auto shrink-0 object-contain"
              priority
            />
            <div className="font-bold tracking-normal">
              <span className="text-2xl text-foreground">Proposal</span>
              <span className="text-2xl text-primary">Lift</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">AI proposals for Upwork</p>
          <div className="mt-6">
            <h2 className="text-2xl font-semibold">Welcome Back</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your credentials to access your account
            </p>
          </div>
        </div>

        {canResend && (
          <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
            <p className="font-medium">Email not verified</p>
            <p className="text-xs text-muted-foreground">
              Use the button below to resend a verification link.
            </p>
            <Button
              type="button"
              className="w-full cursor-pointer"
              onClick={handleResendVerification}
              disabled={resendLoading}
            >
              {resendLoading ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-3 w-3" />
                  Resend verification email
                </>
              )}
            </Button>
          </div>
        )}

        {resendSuccess && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-600">
            Verification email sent! Please check your inbox.
          </div>
        )}

        {/* Login Form */}
        <form className="space-y-6" onSubmit={handleLogin}>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              className="h-11"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                className="h-11 pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5 cursor-pointer" />
                ) : (
                  <Eye className="h-5 w-5 cursor-pointer" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Link
              href="/auth/forget-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            className="h-11 w-full cursor-pointer"
            size="lg"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>

          {/* Hidden unless the self-hoster configured a Google OAuth client;
              otherwise the button would dead-end. */}
          {googleEnabled && (
            <>
              <AuthDivider />
              <GoogleAuthButton onClick={handleGoogleLogin} disabled={loading} />
            </>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Don&rsquo;t have an account?{" "}
            <Link
              href="/signup"
              className="font-medium text-primary hover:underline"
            >
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
