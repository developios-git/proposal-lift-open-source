"use client";

import {
  apiFetch,
  discardResponseBody,
  isAbortError,
} from "@/lib/api-fetch";
import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import debounce from "lodash/debounce";
import type { DebouncedFunc } from "lodash";
import { supabase } from "@/lib/supabase/client";
import { formatRelativeDate } from "@/lib/proposals/format-relative-date";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Proposal } from "@/types";
import {
  Eye,
  Copy,
  RefreshCw,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Send,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ProposalWithExpanded extends Proposal {
  expanded?: boolean;
}

const ITEMS_PER_PAGE = 10;
// One request has to cover every match for the CSV export; the API clamps this
// to its own ceiling.
const EXPORT_LIMIT = 1000;

export default function ProposalHistoryPage() {
  const router = useRouter();
  const [proposals, setProposals] = useState<ProposalWithExpanded[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** The proposal awaiting delete confirmation; null closes the dialog. */
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    jobTitle: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  // -1 until the first unfiltered load lands, so an empty first paint is not
  // mistaken for "this account has no proposals".
  const [baseCount, setBaseCount] = useState(-1);

  const abortRef = useRef<AbortController | null>(null);

  const buildQuery = useCallback(
    (search: string, status: string, pg: number, limit: number) => {
      const params = new URLSearchParams({
        page: String(pg),
        limit: String(limit),
      });
      if (search.trim()) params.set("search", search.trim());
      if (status && status !== "all") params.set("status", status);
      return params.toString();
    },
    [],
  );

  const fetchProposals = useCallback(
    async (search: string, status: string, pg: number, isInitial = false) => {
      // Abort the in-flight request so a slower earlier keystroke cannot
      // overwrite the results of a newer one.
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      try {
        const res = await apiFetch(
          `/api/proposals?${buildQuery(search, status, pg, ITEMS_PER_PAGE)}`,
          { signal },
        );
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
          throw new Error(data.error || "Failed to fetch proposals");
        }
        const data = await res.json();
        setProposals(data.proposals ?? []);
        setTotalPages(data.totalPages ?? 1);
        setTotalCount(data.totalCount ?? 0);
        setCurrentPage(data.currentPage ?? pg);
        if (isInitial) setBaseCount(data.totalCount ?? 0);
      } catch (e) {
        if (isAbortError(e)) return;
        console.error("Error fetching proposals:", e);
        toast.error(
          e instanceof Error ? e.message : "Failed to fetch proposals",
        );
      } finally {
        if (!signal.aborted) {
          if (isInitial) setLoading(false);
          setIsSearching(false);
        }
      }
    },
    [buildQuery],
  );

  /**
   * The debounced search fetcher.
   *
   * Built inside an effect and read only from event handlers. Upstream held it
   * as `useRef(debounce(...)).current`, which reads a ref during render, and
   * `fetchProposals` itself touches `abortRef`.
   */
  const debouncedFetchRef = useRef<DebouncedFunc<
    (search: string, status: string, pg: number) => void
  > | null>(null);

  useEffect(() => {
    const fn = debounce((search: string, status: string, pg: number) => {
      void fetchProposals(search, status, pg);
    }, 300);
    debouncedFetchRef.current = fn;

    return () => {
      fn.cancel();
      debouncedFetchRef.current = null;
      abortRef.current?.abort();
    };
  }, [fetchProposals]);

  useEffect(() => {
    void fetchProposals("", "all", 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
    setIsSearching(true);
    debouncedFetchRef.current?.(value, statusFilter, 1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
    setIsSearching(true);
    debouncedFetchRef.current?.cancel();
    void fetchProposals(searchTerm, value, 1);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    setIsSearching(true);
    debouncedFetchRef.current?.cancel();
    void fetchProposals(searchTerm, statusFilter, newPage);
  };

  const toggleExpand = (id: string) => {
    setProposals(
      proposals.map((p) =>
        p.id === id
          ? { ...p, expanded: !p.expanded }
          : { ...p, expanded: false },
      ),
    );
  };

  const handleStatusUpdate = async (id: string, status: Proposal["status"]) => {
    try {
      const { error } = await supabase
        .from("proposals")
        .update({ status })
        .eq("id", id);

      if (error) throw error;

      toast.success(`Marked as ${status}`);
      // Refetch rather than patching state: the row may no longer belong on
      // this page under the active status filter.
      setIsSearching(true);
      void fetchProposals(searchTerm, statusFilter, currentPage);
    } catch (error) {
      console.error("Error updating proposal status:", error);
      toast.error("Failed to update status");
    }
  };

  /**
   * Deletion is confirmed through the same AlertDialog every other list in the
   * app uses, rather than `window.confirm`. The native dialog could not be
   * themed, named the record only as "this proposal", and browsers let a user
   * suppress it outright — at which point a destructive action would fire with
   * no confirmation at all.
   */
  const handleDeleteDialogOpenChange = (open: boolean) => {
    if (!open && !deleting) setDeleteTarget(null);
  };

  const confirmDeleteProposal = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;

    setDeleting(true);
    try {
      const { error } = await supabase.from("proposals").delete().eq("id", id);

      if (error) throw error;

      setDeleteTarget(null);
      setBaseCount((count) => (count > 0 ? count - 1 : 0));
      // Removing the last row of the final page would otherwise strand us on a
      // page that no longer exists.
      const nextPage =
        proposals.length === 1 && currentPage > 1
          ? currentPage - 1
          : currentPage;
      setIsSearching(true);
      void fetchProposals(searchTerm, statusFilter, nextPage);
    } catch (error) {
      console.error("Error deleting proposal:", error);
      toast.error("Failed to delete proposal");
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Proposal copied to clipboard!");
    } catch (error) {
      console.error("Error copying:", error);
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      // The page only holds one page of rows now, so pull every match that the
      // active search and status filter select.
      const res = await apiFetch(
        `/api/proposals?${buildQuery(searchTerm, statusFilter, 1, EXPORT_LIMIT)}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to export proposals");
      }
      const data = await res.json();
      const rows: Proposal[] = data.proposals ?? [];

      if (rows.length === 0) {
        toast.error("No proposals to export");
        return;
      }

      const headers = [
        "ID",
        "Job Title",
        "Client Name",
        "Status",
        "Created At",
        "Word Count",
      ];
      const csvRows = [
        headers.join(","),
        ...rows.map((p) => {
          const wc = p.proposal_content.trim().split(/\s+/).length;
          return [
            p.id,
            `"${p.job_title.replace(/"/g, '""')}"`,
            `"${p.client_name.replace(/"/g, '""')}"`,
            p.status,
            p.created_at
              ? new Date(p.created_at).toISOString().split("T")[0]
              : "",
            wc,
          ].join(",");
        }),
      ];

      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `proposals-export-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} proposals to CSV`);
    } catch (error) {
      console.error("Error exporting proposals:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to export proposals",
      );
    } finally {
      setExporting(false);
    }
  };

  const handleRegenerate = (proposal: ProposalWithExpanded) => {
    router.push(`/proposals/new?proposalId=${proposal.id}`);
  };

  const getStatusBadge = (status: string | null) => {
    const variants: Record<string, string> = {
      draft: "bg-gray-100 text-gray-600",
      sent: "bg-blue-100 text-blue-600",
      won: "bg-green-100 text-green-600",
      lost: "bg-red-100 text-red-600",
    };

    const key = status ?? "draft";
    return (
      <Badge className={`${variants[key]} text-[10px] font-bold uppercase`}>
        {key}
      </Badge>
    );
  };

  const formatDate = (dateString: string | null) =>
    formatRelativeDate(dateString);

  const wordCount = (text: string | null) => {
    const trimmed = text?.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  };

  // Whether the account has any proposals at all, independent of the active
  // search or status filter.
  const hasProposals = baseCount > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col h-full">
      {loading ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 min-h-0"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Loading proposal history…
          </span>
        </div>
      ) : (
        <>
      {/* Header */}
      <header className="min-h-16 bg-card border-b flex flex-wrap items-center justify-between gap-3 px-4 sm:px-8 py-3 shrink-0">
        <h2 className="text-xl font-bold">Proposal History</h2>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {hasProposals && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
              ) : (
                <Download className="h-4 w-4 sm:mr-2" />
              )}
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          )}
          <Link href="/proposals/new">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">New Proposal</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* Filters: hidden entirely until the account has at least one proposal */}
      {hasProposals && (
        <div className="bg-card p-4 border-b">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[240px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10 pr-9"
                placeholder="Search by client or job title..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div
          className={cn(
            "overflow-x-auto rounded-xl border bg-card",
            isSearching && "opacity-60 pointer-events-none transition-opacity",
          )}
        >
        <div className="min-w-[680px]">
          {proposals.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {hasProposals
                ? "No proposals match your search"
                : "No proposals found"}
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/50 border-b text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Job Title</th>
                  <th className="px-6 py-4">Client Name</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Words</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y">
                {proposals.map((proposal) => (
                  // Each row renders two <tr>s (the row and its expanded
                  // detail), so the list child is this fragment, not the <tr>.
                  // The key has to live here: `<>` cannot take one, and a key
                  // on the inner <tr> is invisible to React's reconciler.
                  <Fragment key={proposal.id}>
                    <tr
                      className={`hover:bg-muted/50 transition-colors ${
                        proposal.expanded
                          ? "bg-muted/30 border-l-4 border-primary"
                          : ""
                      }`}
                    >
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleExpand(proposal.id)}
                          className="text-primary font-bold hover:underline text-left"
                        >
                          {proposal.job_title}
                        </button>
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {proposal.client_name}
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(proposal.status)}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {wordCount(proposal.proposal_content)}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {formatDate(proposal.created_at)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          {proposal.status !== "sent" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-600"
                              onClick={() =>
                                handleStatusUpdate(proposal.id, "sent")
                              }
                              title="Mark as sent"
                              aria-label={`Mark "${proposal.job_title}" as sent`}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleExpand(proposal.id)}
                            title={proposal.expanded ? "Hide details" : "View details"}
                            aria-expanded={Boolean(proposal.expanded)}
                            aria-label={`${proposal.expanded ? "Hide" : "View"} details for "${proposal.job_title}"`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              handleCopy(proposal.proposal_content)
                            }
                            title="Copy proposal"
                            aria-label={`Copy "${proposal.job_title}" to clipboard`}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary"
                            onClick={() => handleRegenerate(proposal)}
                            title="Regenerate proposal"
                            aria-label={`Regenerate "${proposal.job_title}"`}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() =>
                              setDeleteTarget({
                                id: proposal.id,
                                jobTitle: proposal.job_title,
                              })
                            }
                            title="Delete proposal"
                            aria-label={`Delete "${proposal.job_title}"`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>

                    {proposal.expanded && (
                      <tr className="bg-background">
                        <td colSpan={6} className="px-6 py-8">
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 sm:gap-8">
                            <div className="sm:col-span-8 space-y-6">
                              {proposal.job_description && (
                                <div className="space-y-2">
                                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                    Original Job Description
                                  </h4>
                                  <div className="p-4 bg-muted rounded-lg text-sm italic">
                                    {proposal.job_description}
                                  </div>
                                </div>
                              )}

                              <div className="space-y-2">
                                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                  Generated Proposal Text
                                </h4>
                                <div className="prose prose-sm max-w-none bg-muted p-6 rounded-lg border">
                                  {proposal.proposal_content
                                    .split("\n")
                                    .map((line, idx) => (
                                      <p key={idx} className="mb-3">
                                        {line}
                                      </p>
                                    ))}
                                </div>
                              </div>

                              {proposal.selected_projects &&
                                proposal.selected_projects.length > 0 && (
                                  <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                      Referenced Projects
                                    </h4>
                                    <div className="flex gap-2 flex-wrap">
                                      {proposal.selected_projects.map(
                                        (projectId, idx) => (
                                          <Badge
                                            key={idx}
                                            variant="outline"
                                            className="text-xs"
                                          >
                                            Project {idx + 1}
                                          </Badge>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                )}

                              {proposal.notes && (
                                <div className="space-y-2">
                                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                    Notes
                                  </h4>
                                  <div className="p-4 bg-muted rounded-lg text-sm">
                                    {proposal.notes}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="sm:col-span-4 sm:border-l sm:pl-8 space-y-6 pt-4 sm:pt-0 border-t sm:border-t-0">
                              <div className="space-y-4">
                                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                  Proposal Details
                                </h4>
                                <div className="grid grid-cols-1 gap-3">
                                  <div className="flex justify-between items-center py-2 border-b">
                                    <span className="text-xs text-muted-foreground">
                                      Status
                                    </span>
                                    {getStatusBadge(proposal.status)}
                                  </div>
                                  <div className="flex justify-between items-center py-2 border-b">
                                    <span className="text-xs text-muted-foreground">
                                      Word Count
                                    </span>
                                    <span className="text-sm font-semibold">
                                      {wordCount(proposal.proposal_content)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center py-2 border-b">
                                    <span className="text-xs text-muted-foreground">
                                      Created
                                    </span>
                                    <span className="text-sm font-semibold">
                                      {formatDate(proposal.created_at)}
                                    </span>
                                  </div>
                                  {proposal.job_url && (
                                    <div className="flex justify-between items-center py-2 border-b">
                                      <span className="text-xs text-muted-foreground">
                                        Job URL
                                      </span>
                                      <a
                                        href={proposal.job_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-primary hover:underline"
                                      >
                                        View Job
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="pt-4 space-y-3">
                                <Button
                                  className="w-full"
                                  variant="outline"
                                  onClick={() =>
                                    handleCopy(proposal.proposal_content)
                                  }
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy Proposal
                                </Button>
                                <Button
                                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                                  onClick={() => handleRegenerate(proposal)}
                                >
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Regenerate
                                </Button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {proposals.length > 0 && (
            <div className="bg-muted/50 px-4 sm:px-6 py-4 border-t flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-semibold text-foreground">
                  {(currentPage - 1) * ITEMS_PER_PAGE + 1}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-foreground">
                  {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-foreground">
                  {totalCount}
                </span>{" "}
                proposals
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={currentPage === 1 || isSearching}
                  onClick={() => handlePageChange(currentPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <Button
                        key={i}
                        variant={currentPage === pageNum ? "default" : "ghost"}
                        size="icon"
                        className={
                          currentPage === pageNum
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : ""
                        }
                        disabled={isSearching}
                        onClick={() => handlePageChange(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  {totalPages > 5 && currentPage < totalPages - 2 && (
                    <>
                      <span className="px-2 text-muted-foreground">...</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isSearching}
                        onClick={() => handlePageChange(totalPages)}
                      >
                        {totalPages}
                      </Button>
                    </>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  disabled={currentPage >= totalPages || isSearching}
                  onClick={() => handlePageChange(currentPage + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
        </>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={handleDeleteDialogOpenChange}
      >
        <AlertDialogContent aria-busy={deleting}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete proposal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteTarget?.jobTitle}&quot;.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              className="gap-2"
              onClick={confirmDeleteProposal}
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
