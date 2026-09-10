"use client";

import { apiFetch } from "@/lib/api-fetch";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AuthDivider,
  GoogleAuthButton,
} from "@/components/auth/GoogleAuthButton";
import { startGoogleOAuth } from "@/lib/auth/start-google-oauth";

function PageBackground() {
  return (
    <>
      <div className="absolute inset-0 z-0">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="grid-signup"
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
          <rect width="100%" height="100%" fill="url(#grid-signup)" />
        </svg>
      </div>
      <div className="absolute left-1/4 top-1/3 h-[300px] w-[300px] rounded-full bg-accent/20 blur-3xl" />
    </>
  );
}

/**
 * Signup is open in this build.
 *
 * Upstream this page was an invite gate: it validated an `?application` token,
 * locked the email to the invite, rendered an "Early Access Only" screen when
 * the token was missing or dead, and ran a Turnstile challenge. Applications,
 * invitations and Turnstile are all removed here, so what is left is a plain
 * self-serve form.
 */
export function SignupPageClient({ googleEnabled }: { googleEnabled: boolean }) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const router = useRouter();

  const handleGoogleSignup = async () => {
    const result = await startGoogleOAuth();
    if (!result.ok) toast.error(result.error);
  };

  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { label: "", color: "" };
    if (pwd.length < 6) return { label: "Weak", color: "text-red-600" };
    if (pwd.length < 10) return { label: "Moderate", color: "text-yellow-600" };
    return { label: "Strong", color: "text-green-600" };
  };

  const passwordStrength = getPasswordStrength(password);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fullName }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to create account");
        return;
      }

      // Email confirmation on: Supabase returns a user but no session.
      if (data.user && !data.session) {
        setCheckEmail(true);
        toast.success("Check your email to confirm your account.");
        return;
      }

      const next =
        typeof data.redirectTo === "string" && data.redirectTo.startsWith("/")
          ? data.redirectTo
          : "/dashboard";
      router.push(next);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background py-12">
      <PageBackground />

      <div className="relative z-10 w-full max-w-md space-y-6 rounded-2xl border bg-card p-10 shadow-2xl">
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
            <h2 className="text-2xl font-semibold">Create Account</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Fill in the details to get started
            </p>
          </div>
        </div>

        {checkEmail && (
          <div className="space-y-1 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-300">
            <p className="font-medium">Confirm your email</p>
            <p className="text-xs">
              We sent a link to {email}. Open it to finish setting up your
              account.
            </p>
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSignup}>
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              type="text"
              autoComplete="name"
              placeholder="John Doe"
              required
              className="h-11"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
            />
          </div>

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
                autoComplete="new-password"
                placeholder="Create a strong password"
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
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            {password && (
              <p className={`text-xs ${passwordStrength.color}`}>
                Strength: {passwordStrength.label}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Re-enter your password"
                required
                className="h-11 pr-10"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={
                  showConfirmPassword ? "Hide password" : "Show password"
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="h-11 w-full"
            size="lg"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account…
              </>
            ) : (
              "Create Account"
            )}
          </Button>

          {googleEnabled && (
            <>
              <AuthDivider />
              <GoogleAuthButton
                label="Sign up with Google"
                onClick={handleGoogleSignup}
                disabled={loading}
              />
            </>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
