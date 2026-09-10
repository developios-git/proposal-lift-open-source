"use client";

import { apiFetch } from "@/lib/api-fetch";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";

type HookEditSnapshot = {
  title: string;
  description: string;
};

export default function EditHookPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [initialSnapshot, setInitialSnapshot] =
    useState<HookEditSnapshot | null>(null);

  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    return (
      title.trim() !== initialSnapshot.title.trim() ||
      description.trim() !== initialSnapshot.description.trim()
    );
  }, [initialSnapshot, title, description]);

  useEffect(() => {
    const fetchHook = async () => {
      setLoading(true);
      setInitialSnapshot(null);
      try {
        const res = await apiFetch("/api/hooks");
        if (!res.ok) throw new Error("Failed to fetch hooks");
        const data = await res.json();
        const hook = (data.hooks || []).find(
          (h: { id: string }) => h.id === id,
        );
        if (hook) {
          setTitle(hook.title);
          setDescription(hook.description);
          setInitialSnapshot({
            title: hook.title,
            description: hook.description,
          });
        } else {
          toast.error("Hook not found");
          router.push("/hooks");
        }
      } catch {
        toast.error("Failed to load hook");
        router.push("/hooks");
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchHook();
  }, [id, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    const d = description.trim();
    if (!t || !d) {
      toast.error("Title and description are required");
      return;
    }
    if (!isDirty) {
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/hooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, description: d }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update hook");
      }
      setInitialSnapshot({ title: t, description: d });
      toast.success("Hook updated successfully");
      router.push("/hooks");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update hook",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3 min-h-[40vh]"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading hook…</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Link
        href="/hooks"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Hooks
      </Link>

      <h1 className="text-2xl font-semibold mb-4">Edit Hook</h1>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="title"
              className="mb-1.5 block text-sm font-medium uppercase tracking-wide text-muted-foreground"
            >
              Title
            </label>
            <Input
              id="title"
              placeholder="e.g., Joke About Semicolons"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-white h-11"
              required
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="description"
              className="mb-1.5 block text-sm font-medium uppercase tracking-wide text-muted-foreground"
            >
              Description (Hook instruction for AI)
            </label>
            <Textarea
              id="description"
              placeholder="e.g., Start with a light developer joke..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-[140px] bg-white"
              required
            />
          </div>

          <div className="flex justify-end gap-3">
            <Link href="/hooks">
              <Button
                size="sm"
                type="button"
                className="py-2.5 h-auto"
                variant="outline"
              >
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={!isDirty || saving}
              className="gap-2 py-2.5 h-auto"
              size="sm"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
