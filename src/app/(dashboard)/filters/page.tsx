"use client";

import { apiFetch } from "@/lib/api-fetch";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  MoreVertical,
  Copy,
  Trash2,
  Filter,
  FolderOpen,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { SavedJobFilter } from "@/types";
import { toast } from "sonner";
import { redirectToUpworkOAuth } from "@/lib/upwork/start-oauth";
import { UpworkAccessBanner } from "@/components/upwork/UpworkAccessBanner";
import { useCreateFilter } from "@/lib/filters/useCreateFilter";
import { MAX_FILTERS_PER_USER, atFilterLimit } from "@/lib/filters/filter-limits";

export default function FiltersPage() {
  const { createFilter, creating: creatingFilter } = useCreateFilter();
  const [filters, setFilters] = useState<SavedJobFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterToDelete, setFilterToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [filterToToggle, setFilterToToggle] = useState<{
    id: string;
    name: string;
    nextEnabled: boolean;
  } | null>(null);
  const [upworkConnected, setUpworkConnected] = useState<boolean | null>(null);
  /** Whether the user's Upwork OAuth app (Client ID + Secret) is configured. */
  const [upworkOauthReady, setUpworkOauthReady] = useState(false);
  const [connectingUpwork, setConnectingUpwork] = useState(false);

  const fetchFilters = useCallback(async () => {
    try {
      const res = await apiFetch("/api/filters");
      if (res.ok) {
        const data = await res.json();
        setFilters(data.filters || []);
      }
    } catch {
      toast.error("Failed to load filters");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Awaited inside an async IIFE so every setState lands after the request
    // rather than synchronously in the effect body.
    void (async () => {
      await fetchFilters();
    })();
  }, [fetchFilters]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/settings");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setUpworkConnected(!!data.upwork_connected);
        setUpworkOauthReady(!!data.upwork_oauth_ready);
      } catch {
        if (!cancelled) setUpworkConnected(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const deleteInProgress =
    filterToDelete !== null &&
    deletingId !== null &&
    deletingId === filterToDelete.id;

  const toggleInProgress =
    filterToToggle !== null &&
    togglingId !== null &&
    togglingId === filterToToggle.id;

  const confirmToggleFilter = async () => {
    if (!filterToToggle) return;
    const { id, nextEnabled } = filterToToggle;
    setTogglingId(id);
    // Only this row's previous value is captured, so a rollback cannot clobber a
    // concurrent duplicate or delete refresh of the whole list.
    const prevEnabled = filters.find((f) => f.id === id)?.is_enabled ?? true;
    const restorePrevious = () =>
      setFilters((prev) =>
        prev.map((f) => (f.id === id ? { ...f, is_enabled: prevEnabled } : f)),
      );
    setFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, is_enabled: nextEnabled } : f)),
    );
    try {
      const res = await apiFetch(`/api/filters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: nextEnabled }),
      });
      if (!res.ok) {
        restorePrevious();
        const err = await res.json().catch(() => ({}));
        toast.error(
          typeof err.error === "string" ? err.error : "Failed to update filter",
        );
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.filter) {
        setFilters((prev) => prev.map((f) => (f.id === id ? data.filter : f)));
      }
      setFilterToToggle(null);
      toast.success(nextEnabled ? "Filter enabled" : "Filter disabled");
    } catch {
      restorePrevious();
      toast.error("Failed to update filter");
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDeleteFilter = async () => {
    if (!filterToDelete) return;
    const id = filterToDelete.id;
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/filters/${id}`, { method: "DELETE" });
      if (res.ok) {
        setFilterToDelete(null);
        fetchFilters();
        toast.success("Filter deleted");
      } else {
        toast.error("Failed to delete filter");
      }
    } catch {
      toast.error("Failed to delete filter");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    setDuplicatingId(id);
    try {
      const res = await apiFetch(`/api/filters/${id}/duplicate`, {
        method: "POST",
      });
      if (res.ok) {
        fetchFilters();
        toast.success("Filter duplicated");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(
          typeof err.error === "string"
            ? err.error
            : "Failed to duplicate filter",
        );
      }
    } catch {
      toast.error("Failed to duplicate filter");
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleConnectUpwork = async () => {
    setConnectingUpwork(true);
    try {
      // Personal credentials, when present, always take priority over shared.
      await redirectToUpworkOAuth();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to connect to Upwork.",
      );
      setConnectingUpwork(false);
    }
  };

  /**
   * Adding filters requires a usable Upwork connection: the OAuth app
   * (Client ID + Secret) must be configured and the account connected, since
   * filters have no purpose without a feed to pull. `null` = settings still loading.
   */
  /**
   * Mirrors the cap the API enforces, for every path that creates a row —
   * "Add filter" and "Duplicate filter" alike. The server still decides; this
   * only saves the user a round trip to be told no. Checked against the loaded
   * list, so it reads 0 while `loading` is true and neither control is rendered.
   */
  const atFilterCap = atFilterLimit(filters.length);
  const filterCapMessage = `You have reached the limit of ${MAX_FILTERS_PER_USER} filters. Delete one to add another.`;

  const addFilterDisabledReason = (() => {
    if (upworkConnected === null) return "Checking your Upwork connection…";
    if (!upworkConnected) {
      if (!upworkOauthReady) {
        return "Add your Upwork API credentials in Settings to create filters.";
      }
      return "Connect your Upwork account to create filters.";
    }
    if (atFilterCap) return filterCapMessage;
    return null;
  })();
  const addFilterDisabled = addFilterDisabledReason !== null;

  return (
    // min-h-full, not h-full: h-full pins this to the shell's viewport-height
    // box, making the table a shrinkable flex item whose overflow-hidden clips
    // rows past the fold with no scrollbar. See the personas page.
    <div className="flex min-h-full flex-col">
      {upworkConnected === false ? (
        <UpworkAccessBanner
          oauthReady={upworkOauthReady}
          connecting={connectingUpwork}
          onConnect={() => void handleConnectUpwork()}
          connectTitle="Connect Upwork to sync jobs"
          connectDescription="Authorize this app to search Upwork job postings using your API credentials. Jobs matching your search terms will be synced to your Job Feed."
        />
      ) : null}

      {loading ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 min-h-[50vh]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Loading filters…
          </span>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">Job Filters</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Saved Upwork searches that feed your Job Feed.{" "}
                <span
                  className={cn(
                    "tabular-nums",
                    atFilterLimit(filters.length) &&
                      "font-semibold text-destructive",
                  )}
                >
                  {filters.length} / {MAX_FILTERS_PER_USER}
                </span>
              </p>
            </div>
            <div className="shrink-0">
              {addFilterDisabled ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          type="button"
                          className="gap-2"
                          disabled
                          size="lg"
                        >
                          Add filter
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{addFilterDisabledReason}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button
                  type="button"
                  className="gap-2"
                  disabled={creatingFilter}
                  onClick={() => void createFilter()}
                  size="lg"
                >
                  {creatingFilter && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Add filter
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="shrink-0 bg-card rounded-xl border overflow-hidden">
            {filters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Filter className="h-12 w-12 mb-4" />
                <p className="text-lg font-medium">No filters yet</p>
                <p className="text-sm mt-1 mb-4">
                  Create your first filter to get started
                </p>
                {addFilterDisabled ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button type="button" className="gap-2" disabled>
                            <Plus className="h-4 w-4" />
                            Add filter
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{addFilterDisabledReason}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Button
                    type="button"
                    className="gap-2"
                    disabled={creatingFilter}
                    onClick={() => void createFilter()}
                  >
                    {creatingFilter ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add filter
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    {/* w-full on Name absorbs the slack so Status and Actions
                        shrink to their content and sit together on the right. */}
                    <TableHead className="w-full text-muted-foreground text-[11px] font-bold uppercase tracking-wider px-6 py-4">
                      Name
                    </TableHead>
                    <TableHead className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider px-6 py-4 whitespace-nowrap">
                      Status
                    </TableHead>
                    <TableHead className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider px-6 py-4">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filters.map((filter) => (
                    <TableRow
                      key={filter.id}
                      // `=== false`, not `!enabled`: a row loaded before this
                      // column existed must still render as enabled.
                      className={cn(
                        "hover:bg-muted/50 transition-colors",
                        filter.is_enabled === false && "opacity-60",
                      )}
                    >
                      <TableCell className="w-full px-6 py-4 font-medium">
                        {filter.name}
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {/* The switch only opens the confirm dialog. The thumb
                              stays put until the PATCH lands, so cancelling
                              needs no visual undo. */}
                          <Switch
                            id={`filter-enabled-${filter.id}`}
                            checked={filter.is_enabled !== false}
                            disabled={togglingId === filter.id}
                            onCheckedChange={(next) =>
                              setFilterToToggle({
                                id: filter.id,
                                name: filter.name,
                                nextEnabled: next,
                              })
                            }
                            aria-label={`${filter.name} enabled`}
                          />
                          {/* Fixed width so "Enabled"/"Disabled" cannot shift
                              the switch and leave the column ragged. */}
                          <span className="w-16 text-left text-sm text-muted-foreground">
                            {filter.is_enabled === false
                              ? "Disabled"
                              : "Enabled"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {filter.is_enabled === false ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {/* A disabled button swallows the pointer
                                      events the tooltip trigger needs. */}
                                  <span className="inline-flex">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled
                                    >
                                      <FolderOpen className="h-4 w-4 mr-2" />
                                      View filter
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Enable this filter to open it.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/filter/${filter.id}`}>
                                <FolderOpen className="h-4 w-4 mr-2" />
                                View filter
                              </Link>
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                              >
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {/* Duplicating creates a row, so it is capped
                                  exactly like "Add filter". The reason rides on
                                  the label because a menu item has nowhere to
                                  hang a tooltip. */}
                              <DropdownMenuItem
                                onClick={() => handleDuplicate(filter.id)}
                                disabled={
                                  duplicatingId === filter.id || atFilterCap
                                }
                                title={atFilterCap ? filterCapMessage : undefined}
                              >
                                {duplicatingId === filter.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                  <Copy className="h-4 w-4 mr-2" />
                                )}
                                {atFilterCap
                                  ? `Duplicate (limit ${MAX_FILTERS_PER_USER} reached)`
                                  : "Duplicate filter"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() =>
                                  setFilterToDelete({
                                    id: filter.id,
                                    name: filter.name,
                                  })
                                }
                                disabled={deletingId === filter.id}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete filter
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}

      <AlertDialog
        open={filterToToggle !== null}
        onOpenChange={(open) => {
          if (!open && toggleInProgress) return;
          if (!open) setFilterToToggle(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {filterToToggle?.nextEnabled
                ? "Enable filter?"
                : "Disable filter?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {filterToToggle?.nextEnabled ? (
                <>
                  <span className="font-medium text-foreground">
                    {filterToToggle?.name ?? "This filter"}
                  </span>{" "}
                  will reappear in your Job Feed and start pulling jobs from
                  Upwork again.
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">
                    {filterToToggle?.name ?? "This filter"}
                  </span>{" "}
                  will be hidden from your Job Feed, its page will no longer
                  open, and it will stop pulling jobs from Upwork. Its saved
                  criteria are kept. You can enable it again at any time.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggleInProgress}>
              Cancel
            </AlertDialogCancel>
            {/* A raw Button, not AlertDialogAction: the action auto-closes on
                click and cannot hold the in-flight state. */}
            <Button
              type="button"
              disabled={toggleInProgress}
              onClick={() => void confirmToggleFilter()}
            >
              {toggleInProgress ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {filterToToggle?.nextEnabled ? "Enabling…" : "Disabling…"}
                </>
              ) : filterToToggle?.nextEnabled ? (
                "Enable filter"
              ) : (
                "Disable filter"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={filterToDelete !== null}
        onOpenChange={(open) => {
          if (!open && deleteInProgress) return;
          if (!open) setFilterToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete filter?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {filterToDelete?.name ?? "this filter"}
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteInProgress}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteInProgress}
              onClick={() => void confirmDeleteFilter()}
            >
              {deleteInProgress ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting…
                </>
              ) : (
                "Delete filter"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
