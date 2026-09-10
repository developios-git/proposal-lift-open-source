"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Plus,
  Trash2,
  Send,
  AlertTriangle,
  Webhook,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type WebhookConfig = {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  consecutive_failures: number;
  last_failure_at: string | null;
  created_at: string;
  updated_at: string;
};

type WebhookEligibility = {
  canCreate: boolean;
  code: "not_connected" | "no_filters" | null;
  reason: string | null;
};

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (path.length > 8) {
      return `${parsed.origin}${path.slice(0, 6)}****`;
    }
    return `${parsed.origin}${path}`;
  } catch {
    return url.slice(0, 20) + "****";
  }
}

export function WebhookSettings() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [eligibility, setEligibility] = useState<WebhookEligibility | null>(
    null,
  );

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [creating, setCreating] = useState(false);

  // Per-row state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebhookConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  /**
   * Load on mount.
   *
   * Inlined rather than calling a `useCallback`'d fetcher: this project's
   * eslint-config-next is newer than the one upstream built against, and its
   * `react-hooks/set-state-in-effect` rule cannot see past the indirection to
   * tell that every setState here happens after an await. `loading` already
   * starts `true`, so nothing needs setting synchronously either way.
   *
   * The `cancelled` guard stops a late response writing state after unmount.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await apiFetch("/api/webhooks");
        const data = (await res.json()) as {
          webhooks: WebhookConfig[];
          eligibility?: WebhookEligibility;
        };
        if (cancelled) return;
        setWebhooks(data.webhooks);
        if (data.eligibility) setEligibility(data.eligibility);
      } catch {
        if (!cancelled) toast.error("Failed to load webhooks.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate() {
    if (eligibility && !eligibility.canCreate) {
      toast.error(eligibility.reason ?? "Webhooks aren't available right now.");
      return;
    }
    if (!newName.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!newUrl.trim()) {
      toast.error("URL is required.");
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), url: newUrl.trim() }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed to add webhook.");
      }
      const data = await res.json() as { webhook: WebhookConfig };
      setWebhooks((prev) => [...prev, data.webhook]);
      setNewName("");
      setNewUrl("");
      setShowAddForm(false);
      toast.success("Webhook added.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add webhook.";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(webhook: WebhookConfig) {
    setTogglingId(webhook.id);
    try {
      const res = await apiFetch(`/api/webhooks/${webhook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !webhook.is_active }),
      });
      if (!res.ok) throw new Error("Failed to update webhook.");
      const data = await res.json() as { webhook: WebhookConfig };
      setWebhooks((prev) => prev.map((w) => w.id === webhook.id ? data.webhook : w));
    } catch {
      toast.error("Failed to update webhook.");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleTest(webhook: WebhookConfig) {
    setTestingId(webhook.id);
    try {
      const res = await apiFetch(`/api/webhooks/${webhook.id}/test`, { method: "POST" });
      const data = await res.json() as { success: boolean; error?: string; statusCode?: number };
      if (data.success) {
        toast.success(`Test sent successfully${data.statusCode ? ` (${data.statusCode})` : ""}.`);
      } else {
        toast.error(`Test failed: ${data.error ?? "Unknown error"}`);
      }
    } catch {
      toast.error("Failed to send test.");
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/webhooks/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete webhook.");
      setWebhooks((prev) => prev.filter((w) => w.id !== deleteTarget.id));
      toast.success("Webhook deleted.");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete webhook.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="px-4 sm:px-6 pb-8 space-y-6">
      <div>
        <h3 className="text-base font-semibold">Webhook Notifications</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Receive job alerts in any automation tool (Make, n8n, Zapier, or any HTTP endpoint) when you&apos;re offline.
        </p>
      </div>

      {/* Webhook list */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading webhooks…
        </div>
      ) : webhooks.length === 0 && !showAddForm ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Webhook className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No webhooks configured</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add a webhook URL to receive job alerts when you&apos;re not browsing.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className={cn(
                "rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3",
                !webhook.is_active && "opacity-60",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{webhook.name}</span>
                  {!webhook.is_active && (
                    <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
                      Disabled
                    </Badge>
                  )}
                  {webhook.consecutive_failures >= 5 && (
                    <Badge variant="outline" className="text-xs shrink-0 bg-red-50 text-red-700 border-red-200">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Failing
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
                  {maskUrl(webhook.url)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Active toggle */}
                <div className="flex items-center gap-1.5">
                  {togglingId === webhook.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Switch
                      checked={webhook.is_active}
                      onCheckedChange={() => void handleToggle(webhook)}
                      aria-label={webhook.is_active ? "Disable webhook" : "Enable webhook"}
                    />
                  )}
                </div>

                {/* Test button */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={testingId === webhook.id || !webhook.is_active}
                  onClick={() => void handleTest(webhook)}
                >
                  {testingId === webhook.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span className="ml-1.5">Test</span>
                </Button>

                {/* Delete button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteTarget(webhook)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add webhook form / eligibility gate */}
      {eligibility && !eligibility.canCreate ? (
        <div className="rounded-xl border border-amber-200/90 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/25">
          <div className="flex gap-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-500 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                One step before webhooks
              </p>
              <p className="text-xs text-amber-900/85 dark:text-amber-200/80 mt-0.5">
                {eligibility.reason}
              </p>
            </div>
          </div>
        </div>
      ) : showAddForm ? (
        <div className="rounded-xl border p-4 space-y-3 bg-card">
          <p className="text-sm font-medium">Add webhook</p>
          <div className="space-y-1.5">
            <Label htmlFor="webhook-name" className="text-xs">Name</Label>
            <Input
              id="webhook-name"
              placeholder="e.g. My Make scenario"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={creating}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="webhook-url" className="text-xs">Webhook URL</Label>
            <Input
              id="webhook-url"
              placeholder="https://hook.make.com/... or any public HTTPS URL"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              disabled={creating}
              type="url"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={creating}
              onClick={() => {
                setShowAddForm(false);
                setNewName("");
                setNewUrl("");
              }}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={creating} onClick={() => void handleCreate()}>
              {creating && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Add webhook
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
          disabled={loading}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add webhook
        </Button>
      )}

      {/* How it works */}
      <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How it works</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li className="flex items-start gap-2">
            <CheckCircle className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
            The server checks for new jobs every 5 minutes.
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
            If you&apos;re browsing the dashboard, browser notifications handle it — no webhook is sent.
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
            If you&apos;re offline, new matches are delivered to every active webhook.
          </li>
          <li className="flex items-start gap-2">
            <XCircle className="h-3.5 w-3.5 text-orange-500 mt-0.5 shrink-0" />
            A webhook is auto-disabled after 5 consecutive delivery failures.
          </li>
        </ul>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; will be permanently removed. No further deliveries
              will be sent to{" "}
              <span className="font-mono text-xs">{deleteTarget ? maskUrl(deleteTarget.url) : ""}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
