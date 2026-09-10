"use client";

import {
  apiFetch,
  discardResponseBody,
  isAbortError,
} from "@/lib/api-fetch";
import { Plus, Search, Edit, Trash2, UserCircle2, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import debounce from "lodash/debounce";
import type { DebouncedFunc } from "lodash";
import type { Persona } from "@/types";
import type { UpworkPersonaDraft } from "@/lib/personas/map-upwork-member-to-persona";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "next/navigation";
import { ImportUpworkMemberDialog } from "@/components/personas/ImportUpworkMemberDialog";
import { usePersonaImportDraftStore } from "@/lib/personas/persona-import-draft-store";
import { UpworkImportGate } from "@/components/upwork/UpworkImportGate";
import { useUpworkConnection } from "@/lib/upwork/use-upwork-connection";
import { upworkImportDisabledReason } from "@/lib/upwork/upwork-import-disabled-reason";
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
import { cn } from "@/lib/utils";

/** Role titles imported from Upwork run long, so the column shows a stub. */
const ROLE_PREVIEW_CHARS = 12;

function previewRole(role: string | null | undefined): string {
  const trimmed = role?.trim();
  if (!trimmed) return "Not set";
  return trimmed.length > ROLE_PREVIEW_CHARS
    ? `${trimmed.slice(0, ROLE_PREVIEW_CHARS)}…`
    : trimmed;
}

export default function PersonasPage() {
  const router = useRouter();
  const setImportDraft = usePersonaImportDraftStore((s) => s.setDraft);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [baseCount, setBaseCount] = useState(-1);
  const [personaToDelete, setPersonaToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const fetchPersonas = useCallback(
    async (search: string, pg: number, isInitial = false) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      const params = new URLSearchParams({ page: String(pg), limit: "10" });
      if (search.trim()) params.set("search", search.trim());

      try {
        const res = await apiFetch(`/api/personas?${params.toString()}`, {
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
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load personas");
        setPersonas(data.personas ?? []);
        setTotalPages(data.totalPages ?? 1);
        if (isInitial) setBaseCount(data.totalCount ?? 0);
      } catch (e) {
        if (isAbortError(e)) return;
        console.error(e);
        toast.error(e instanceof Error ? e.message : "Failed to load personas");
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
   * as `useRef(debounce(...)).current`, which reads a ref during render; moving
   * the construction into a memo instead just relocated the problem, because
   * `fetchPersonas` itself touches `abortRef`. Creating it here keeps every ref
   * access out of the render phase, and puts `cancel()` next to what it cancels.
   */
  const debouncedFetchRef = useRef<DebouncedFunc<
    (search: string, pg: number) => void
  > | null>(null);

  useEffect(() => {
    const fn = debounce((search: string, pg: number) => {
      void fetchPersonas(search, pg);
    }, 300);
    debouncedFetchRef.current = fn;

    return () => {
      fn.cancel();
      debouncedFetchRef.current = null;
      abortRef.current?.abort();
    };
  }, [fetchPersonas]);

  useEffect(() => {
    void fetchPersonas("", 1, true);
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
    void fetchPersonas(searchQuery, newPage);
  };

  const confirmDeletePersona = async () => {
    if (!personaToDelete) return;
    const { id } = personaToDelete;
    setPersonaToDelete(null);

    try {
      const res = await apiFetch(`/api/personas/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete");
      }
      toast.success("Persona deleted");
      setPage(1);
      void fetchPersonas(searchQuery, 1, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const upworkConnection = useUpworkConnection();
  const importDisabledReason = upworkImportDisabledReason(
    upworkConnection,
    "import personas",
  );

  /** Stash the chosen draft, then hand off to the create form to review it. */
  const handleImportSelect = (draft: UpworkPersonaDraft) => {
    setImportDraft(draft);
    router.push("/personas/new");
  };

  /** Bulk import wrote rows already, so stay here and reload the list. */
  const handleBulkImported = () => {
    setPage(1);
    setSearchQuery("");
    void fetchPersonas("", 1, true);
  };

  const showFullEmptyState = baseCount === 0 && !loading;

  return (
    // min-h-full, not h-full: the dashboard shell hands each page a
    // viewport-height box, and pinning to it makes the table below a shrinkable
    // flex item. Its overflow-hidden (for the rounded corners) then CLIPS rows
    // past the fold instead of overflowing, so no scrollbar ever appears and
    // they are unreachable. min-h-full still fills a short page, but grows.
    //
    // pb-16 keeps the last row's action buttons clear of the feedback FAB,
    // which is fixed at bottom-4 right-4 (md:bottom-6) and is 44px tall, so it
    // covers ~60px of the bottom-right corner. The shell's own p-4 md:p-8 is
    // not enough on its own. Padding is inside min-h-full under border-box, so
    // this adds no scrollbar on a short page.
    <div className="flex min-h-full flex-col pb-16">
      {loading ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 min-h-[50vh]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Loading personas…
          </span>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 mb-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-2xl font-bold">Personas</h1>
                <p className="text-sm text-muted-foreground">
                  Identities used when generating proposals.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <UpworkImportGate reason={importDisabledReason}>
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={importDisabledReason !== null}
                    onClick={() => setImportOpen(true)}
                  >
                    Import from Upwork
                  </Button>
                </UpworkImportGate>
                <Link href="/personas/new">
                  <Button
                    size="lg"
                    className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                  >
                    New persona
                  </Button>
                </Link>
              </div>
            
            </div>
            {/* Keyed on `baseCount`, not on the current result count: a search
                that matches nothing must keep its own input on screen, or the
                user cannot clear it. This hides only when the account has no
                personas at all, where there is nothing to search. */}
            {!showFullEmptyState && (
              <div className="relative w-full max-w-md group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10 pr-9 bg-muted/50"
                  placeholder="Search personas..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            )}
          </div>

          {showFullEmptyState ? (
            <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed bg-muted/20 py-24">
              <div className="text-center max-w-md px-4">
                <UserCircle2 className="h-14 w-14 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">No personas yet</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  Create a persona with the profile details you want the AI to
                  use when writing proposals.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link href="/personas/new">
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create your first persona
                    </Button>
                  </Link>
                  <UpworkImportGate reason={importDisabledReason}>
                    <Button
                      variant="outline"
                      disabled={importDisabledReason !== null}
                      onClick={() => setImportOpen(true)}
                    >
                      Import from Upwork
                    </Button>
                  </UpworkImportGate>
                </div>
              
              </div>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  // shrink-0 so the table is never compressed by the column
                  // flex parent; overflow-hidden here would clip the rows.
                  "shrink-0 border rounded-xl overflow-hidden bg-card",
                  isSearching &&
                    "opacity-60 pointer-events-none transition-opacity",
                )}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="hidden md:table-cell max-w-[320px]">
                        Bio
                      </TableHead>
                      {/*
                        pr-14 keeps the action buttons out of the feedback
                        FAB's lane. The FAB is fixed at right-4 (md:right-6)
                        and 44px wide, so it covers roughly the rightmost 44
                        to 68px of the viewport at every scroll position, not
                        just at the bottom. Vertical padding cannot help: any
                        row scrolled under it would be unclickable.
                      */}
                      <TableHead className="w-[180px] pr-14 text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {personas.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center py-10 text-muted-foreground"
                        >
                          No personas match your search
                        </TableCell>
                      </TableRow>
                    ) : (
                      personas.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            {p.full_name?.trim() || "Unnamed persona"}
                          </TableCell>
                          <TableCell
                            className="text-muted-foreground"
                            // Full role stays reachable on hover, since 12
                            // characters rarely identifies it on its own.
                            title={p.role_title?.trim() || undefined}
                          >
                            {previewRole(p.role_title)}
                          </TableCell>
                          <TableCell className="hidden md:table-cell max-w-[320px] truncate text-muted-foreground text-sm">
                            {p.bio || "-"}
                          </TableCell>
                          <TableCell className="pr-14 text-right">
                            <div className="flex justify-end gap-1">
                              <Link href={`/personas/${p.id}/edit`}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9"
                                  title="Edit"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </Link>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:text-destructive hover:bg-red-50"
                                title="Delete"
                                onClick={() =>
                                  setPersonaToDelete({
                                    id: p.id,
                                    name: p.full_name?.trim() || "Unnamed",
                                  })
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
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
      )}

      <ImportUpworkMemberDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSelect={handleImportSelect}
        onBulkImported={handleBulkImported}
      />
    

      <AlertDialog
        open={personaToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPersonaToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete persona?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">
                {personaToDelete?.name ?? "this persona"}
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() => void confirmDeletePersona()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
