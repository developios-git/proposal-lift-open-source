"use client";

import { apiFetch } from "@/lib/api-fetch";
import { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, CheckCircle, Lock, MapPin } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";

function safeExitHref(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/dashboard";
  }
  return raw;
}

export function ProfileEditForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const exitHref = useMemo(
    () => safeExitHref(searchParams.get("returnTo")),
    [searchParams],
  );

  const { user } = useAuthStore(
    useShallow((state) => ({
      user: state.user,
    })),
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [location, setLocation] = useState("");

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/profile");
      if (!res.ok) {
        throw new Error("Failed to fetch profile");
      }
      const data = await res.json();
      const p = data.profile;
      if (p) {
        setFullName(p.full_name ?? "");
        setRoleTitle(p.role_title ?? "");
        setLocation(p.location ?? "");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load profile",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Awaited inside an async IIFE so every setState lands after the fetch,
    // rather than synchronously inside the effect body.
    void (async () => {
      await fetchProfile();
    })();
  }, [fetchProfile]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await apiFetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName || null,
          role_title: roleTitle || null,
          location: location || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save profile");
      }
      router.push(exitHref);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save profile",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push(exitHref);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 -mx-8 -mt-8 flex items-center justify-between border-b bg-background px-8 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href={exitHref}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h2 className="text-xl font-bold">Edit Profile</h2>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            {saving ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl p-8">
        <div className="space-y-8 pb-12">
          <section className="rounded-2xl border bg-card p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <span className="text-xl text-primary">&#x1F464;</span>
              <h3 className="text-lg font-bold">Personal Info</h3>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold">Full Name</label>
                <Input
                  placeholder="e.g. John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold">Role Title</label>
                <Input
                  placeholder="e.g. Lead Designer"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-muted-foreground">
                  Email Address (Read Only)
                </label>
                <div className="flex items-center gap-2 rounded-lg border bg-muted px-4 py-2.5">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {user?.email ?? "---"}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold">Location</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="City, Country"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
              </div>

            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
