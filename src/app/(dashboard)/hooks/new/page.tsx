"use client";

import { apiFetch } from "@/lib/api-fetch";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function NewHookPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    const d = description.trim();
    if (!t || !d) {
      toast.error("Title and description are required");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, description: d }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create hook");
      }
      toast.success("Hook created successfully");
      router.push("/hooks");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create hook",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      <Link
        href="/hooks"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Hooks
      </Link>

      <h1 className="text-2xl font-semibold mb-4">Create Hook</h1>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="title"
              className="mb-1.5 font-medium block text-sm uppercase tracking-wide text-muted-foreground"
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
              placeholder="e.g., Start with a light developer joke about missing semicolons, then pivot to how you caught similar bugs in a recent project."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-[140px] bg-white"
              required
            />
            <p className="text-xs text-muted-foreground">
              This text is passed to the AI when generating the proposal hook.
              Describe the strategy or approach you want the hook to follow.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <Link href="/hooks">
              <Button
                size="sm"
                type="button"
                variant="outline"
                className="py-2.5 h-auto"
              >
                Cancel
              </Button>
            </Link>
            <Button
              size="sm"
              type="submit"
              disabled={saving}
              className="gap-2 py-2.5 h-auto"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Create Hook
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
