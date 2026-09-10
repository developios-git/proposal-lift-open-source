"use client";

import {
  apiFetch,
  discardResponseBody,
  isAbortError,
} from "@/lib/api-fetch";
import { Plus, Search, Edit, Trash2, Anchor, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import debounce from "lodash/debounce";
import type { DebouncedFunc } from "lodash";
import type { Hook } from "@/types";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export default function HooksPage() {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [baseCount, setBaseCount] = useState(-1);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const fetchHooks = useCallback(
    async (search: string, pg: number, isInitial = false) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      const params = new URLSearchParams({ page: String(pg), limit: "10" });
      if (search.trim()) params.set("search", search.trim());

      try {
        const res = await apiFetch(`/api/hooks?${params.toString()}`, {
          signal,
        });
        if (signal.aborted) {
          // The response arrived but is being thrown away. Release its body:
          // an unread stream that errors on abort rejects with nothing
          // observing it, which the browser reports as an uncaught
          // AbortError pointing at the abort() call.
          discardResponseBody(res);
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to fetch hooks");
        }
        const data = await res.json();
        setHooks(data.hooks ?? []);
        setTotalPages(data.totalPages ?? 1);
        if (isInitial) setBaseCount(data.totalCount ?? 0);
      } catch (e) {
        if (isAbortError(e)) return;
        console.error("Error fetching hooks:", e);
        toast.error(e instanceof Error ? e.message : "Failed to fetch hooks");
      } finally {
        if (!signal.aborted) {
          if (isInitial) setLoading(false);
          else setIsSearching(false);
        }
      }
    },
    [],
  );

  /**
   * The debounced search fetcher.
   *
   * Built inside an effect and read only from event handlers. Upstream held it
   * as `useRef(debounce(...)).current`, which reads a ref during render, and the
   * fetcher itself touches `abortRef`. Creating it here keeps every ref access
   * out of the render phase and puts `cancel()` next to what it cancels.
   */
  const debouncedFetchRef = useRef<DebouncedFunc<
    (search: string, pg: number) => void
  > | null>(null);

  useEffect(() => {
    const fn = debounce((search: string, pg: number) => {
      void fetchHooks(search, pg);
    }, 300);
    debouncedFetchRef.current = fn;

    return () => {
      fn.cancel();
      debouncedFetchRef.current = null;
      abortRef.current?.abort();
    };
  }, [fetchHooks]);

  useEffect(() => {
    void fetchHooks("", 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
    setIsSearching(true);
    debouncedFetchRef.current?.(value, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setIsSearching(true);
    void fetchHooks(searchQuery, newPage);
  };

  const confirmDeleteHook = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/hooks/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete hook");
      }
      toast.success("Hook deleted successfully");
      setDeleteTarget(null);
      setPage(1);
      void fetchHooks(searchQuery, 1, true);
    } catch (error) {
      console.error("Error deleting hook:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete hook",
      );
    } finally {
      setDeleting(false);
    }
  };

  const hasHooks = baseCount > 0;

  const handleDeleteDialogOpenChange = (open: boolean) => {
    if (!open) {
      if (deleting) return;
      setDeleteTarget(null);
    }
  };

  return (
    // min-h-full, not h-full: h-full pins this to the shell's viewport-height
    // box, making the table a shrinkable flex item whose overflow-hidden clips
    // rows past the fold with no scrollbar. See the personas page.
    <div className="flex min-h-full flex-col">
      {loading ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 min-h-[40vh]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading hooks…</span>
        </div>
      ) : hasHooks ? (
        <>
          {/* Page Header */}
          <div className="flex flex-col gap-4 mb-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-2xl font-bold">Hooks</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Reusable opening lines for proposals.
                </p>
              </div>
              <Link href="/hooks/new">
                <Button
                  className="bg-primary text-black hover:bg-primary/90 shadow-lg shadow-primary/20"
                  size="lg"
                >
                  Create Hook
                </Button>
              </Link>
            </div>
            <div className="relative w-full max-w-md group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                className="pl-10 pr-9 bg-muted/50"
                placeholder="Search hooks..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Hooks Table */}
          {hooks.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No hooks match your search.
            </p>
          ) : (
            <>
              <div
                className={cn(
                  // shrink-0 so the column flex parent never compresses the
                  // table into its own overflow-hidden.
                  "shrink-0 border rounded-xl overflow-hidden bg-card",
                  isSearching &&
                    "opacity-60 pointer-events-none transition-opacity",
                )}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead className="max-w-[400px]">
                        Description
                      </TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[100px] text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hooks.map((hook) => (
                      <TableRow key={hook.id}>
                        <TableCell className="font-medium">
                          {hook.title}
                        </TableCell>
                        <TableCell className="max-w-[400px] text-muted-foreground truncate">
                          {hook.description}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {hook.created_at
                            ? new Date(hook.created_at).toLocaleDateString()
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/hooks/${hook.id}/edit`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 hover:bg-primary/10 hover:text-primary"
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 hover:bg-destructive/10 hover:text-destructive"
                              title="Delete"
                              onClick={() =>
                                setDeleteTarget({
                                  id: hook.id,
                                  title: hook.title,
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1 || isSearching}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages || isSearching}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        /* Empty State */
        <div className="flex-1 flex items-center justify-center -mt-16">
          <div className="text-center max-w-md">
            <div className="mb-8 flex justify-center">
              <div className="relative">
                <div className="w-32 h-32 bg-muted/50 rounded-3xl flex items-center justify-center">
                  <div className="w-20 h-20 bg-background rounded-2xl shadow-lg flex items-center justify-center relative">
                    <Anchor className="h-10 w-10 text-primary" />
                  </div>
                </div>
                <div className="absolute -bottom-2 -right-2 w-16 h-16 bg-primary rounded-full opacity-80" />
              </div>
            </div>

            <h2 className="text-3xl font-bold mb-4">No hooks yet</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Create custom proposal hooks with titles and descriptions. Use
              them when regenerating hooks in the proposal generator for a
              consistent, personalized approach.
            </p>

            <Link href="/hooks/new">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-black shadow-lg shadow-primary/20 mb-4"
              >
                <Plus className="h-5 w-5 mr-2" />
                Create Hook
              </Button>
            </Link>

            <div className="mt-6">
              <span className="text-sm text-muted-foreground inline-flex items-center gap-1 cursor-default">
                Hooks are used as AI instructions when generating proposal
                openings. Add your preferred hook strategies to reuse them.
              </span>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={handleDeleteDialogOpenChange}
      >
        <AlertDialogContent aria-busy={deleting}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete hook?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteTarget?.title}&quot;.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              className="gap-2"
              onClick={confirmDeleteHook}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
