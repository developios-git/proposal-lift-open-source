"use client";

import {
  apiFetch,
  discardResponseBody,
  isAbortError,
} from "@/lib/api-fetch";
import { useOpenAIKeyStatus } from "@/lib/ai/use-openai-key-status";
import { OpenAIKeyRequired } from "@/components/portfolio/OpenAIKeyRequired";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  ExternalLink,
  Star,
  Filter,
  Layers,
  Loader2,
  Copy,
  Upload,
  Download,
  Pencil,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ChangeEvent,
} from "react";
import debounce from "lodash/debounce";
import type { DebouncedFunc } from "lodash";
import { supabase } from "@/lib/supabase/client";
import type { Project } from "@/types";
import type { UpworkPortfolioItem } from "@/lib/upwork/client";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { UpworkImportGate } from "@/components/upwork/UpworkImportGate";
import { useUpworkConnection } from "@/lib/upwork/use-upwork-connection";
import { upworkImportDisabledReason } from "@/lib/upwork/upwork-import-disabled-reason";
import { PORTFOLIO_IMPORT_PROMPT } from "@/lib/portfolio/import-prompt";
import { cn } from "@/lib/utils";

const CATEGORY_COLOR_CLASSES: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  indigo: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  green: "bg-green-500/10 text-green-600 border-green-500/20",
  lime: "bg-lime-500/10 text-lime-600 border-lime-500/20",
  pink: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  amber: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  orange: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  cyan: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  emerald: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  violet: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  gray: "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

const CAT_COLOR_OPTIONS = [
  { value: "blue", bg: "bg-blue-500" },
  { value: "indigo", bg: "bg-indigo-500" },
  { value: "green", bg: "bg-green-500" },
  { value: "lime", bg: "bg-lime-500" },
  { value: "pink", bg: "bg-pink-500" },
  { value: "amber", bg: "bg-amber-500" },
  { value: "orange", bg: "bg-orange-500" },
  { value: "cyan", bg: "bg-cyan-500" },
  { value: "emerald", bg: "bg-emerald-500" },
  { value: "violet", bg: "bg-violet-500" },
];

const CAT_COLOR_DOT: Record<string, string> = {
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  green: "bg-green-500",
  lime: "bg-lime-500",
  pink: "bg-pink-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  cyan: "bg-cyan-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  gray: "bg-gray-400",
};

export default function PortfoliosPage() {

  const upworkConnection = useUpworkConnection();
  const upworkImportReason = upworkImportDisabledReason(
    upworkConnection,
    "import portfolio items",
  );

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({
    total: 0,
    featured: 0,
    thisMonth: 0,
    unembedded: 0,
  });
  /**
   * Projects with a NULL `embedding`.
   *
   * New for this build. Creating a project now requires an OpenAI key, so a row
   * reaches this state only when the embedding call itself failed (a rate
   * limit, a revoked key, an outage) or when it predates that rule. Either way
   * it is excluded from job matching, and that must never be silent, so
   * unembedded rows are badged and a backfill action is offered below.
   */
  const [unembeddedIds, setUnembeddedIds] = useState<Set<string>>(new Set());
  const [backfilling, setBackfilling] = useState(false);
  const aiKeyStatus = useOpenAIKeyStatus();
  const [portfolioCategories, setPortfolioCategories] = useState<
    { id: string; name: string; slug: string; color: string | null }[]
  >([]);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [manageCatOpen, setManageCatOpen] = useState(false);
  const [catLoading, setCatLoading] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("blue");
  const [addingCat, setAddingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatColor, setEditCatColor] = useState("blue");
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<string | null>(
    null,
  );
  const [importJsonText, setImportJsonText] = useState("");
  const [importSubmitting, setImportSubmitting] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [upworkImportDialogOpen, setUpworkImportDialogOpen] = useState(false);
  const [upworkDialogState, setUpworkDialogState] = useState<
    "checking" | "not_connected" | "preview" | "importing" | "done"
  >("checking");
  const [upworkItems, setUpworkItems] = useState<UpworkPortfolioItem[]>([]);
  const [upworkSelectedIds, setUpworkSelectedIds] = useState<Set<number>>(
    new Set(),
  );
  const [upworkImportResult, setUpworkImportResult] = useState<{
    added: number;
    failed: number;
    errors?: { index: number; message: string }[];
    embeddingWarnings?: { projectId: string; message: string }[];
  } | null>(null);
  const [upworkAlreadyImportedCount, setUpworkAlreadyImportedCount] =
    useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const fetchPortfolioCategories = async () => {
    try {
      const res = await apiFetch("/api/settings/portfolio-categories");
      const data = await res.json();
      if (res.ok) {
        setPortfolioCategories(data.categories || []);
      }
    } catch {
      // ignore
    }
  };

  const openManageCategories = async () => {
    setManageCatOpen(true);
    setCatLoading(true);
    try {
      const res = await apiFetch("/api/settings/portfolio-categories");
      const data = await res.json();
      if (res.ok) setPortfolioCategories(data.categories || []);
    } catch {
      // ignore
    } finally {
      setCatLoading(false);
    }
  };

  const handleAddCat = async () => {
    if (!newCatName.trim()) return;
    setAddingCat(true);
    try {
      const res = await apiFetch("/api/settings/portfolio-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName.trim(), color: newCatColor }),
      });
      const data = await res.json();
      if (res.ok) {
        setPortfolioCategories((prev) => [...prev, data.category]);
        setNewCatName("");
        setNewCatColor("blue");
        toast.success("Category added");
      } else {
        toast.error(data.error || "Failed to add category");
      }
    } catch {
      toast.error("Failed to add category");
    } finally {
      setAddingCat(false);
    }
  };

  const handleUpdateCat = async () => {
    if (!editingCatId || !editCatName.trim()) return;
    try {
      const res = await apiFetch("/api/settings/portfolio-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingCatId,
          name: editCatName.trim(),
          color: editCatColor,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPortfolioCategories((prev) =>
          prev.map((c) => (c.id === editingCatId ? data.category : c)),
        );
        setEditingCatId(null);
        setEditCatName("");
        toast.success("Category updated");
      } else {
        toast.error(data.error || "Failed to update category");
      }
    } catch {
      toast.error("Failed to update category");
    }
  };

  const handleDeleteCat = async (id: string) => {
    setDeletingCatId(id);
    try {
      const res = await apiFetch(
        `/api/settings/portfolio-categories?id=${id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (res.ok) {
        setPortfolioCategories((prev) => prev.filter((c) => c.id !== id));
        setConfirmDeleteCatId(null);
        toast.success("Category deleted");
      } else {
        toast.error(data.error || "Failed to delete category");
      }
    } catch {
      toast.error("Failed to delete category");
    } finally {
      setDeletingCatId(null);
    }
  };

  const categoryLabels: Record<string, string> = Object.fromEntries(
    portfolioCategories.map((c) => [c.slug, c.name]),
  );
  const categoryColors: Record<string, string> = Object.fromEntries(
    portfolioCategories.map((c) => [
      c.slug,
      CATEGORY_COLOR_CLASSES[c.color || "gray"] ||
        "bg-gray-500/10 text-gray-600 border-gray-500/20",
    ]),
  );

  const getCategoryLabel = (slug: string) =>
    slug
      ? (categoryLabels[slug] ??
        slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " "))
      : "Other";

  const getCategoryColor = (slug: string) =>
    slug
      ? (categoryColors[slug] ??
        "bg-gray-500/10 text-gray-600 border-gray-500/20")
      : "bg-gray-500/10 text-gray-600 border-gray-500/20";

  const fetchProjects = useCallback(
    async (
      search: string,
      category: string | null,
      pg: number,
      isInitial = false,
    ) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      const params = new URLSearchParams({ page: String(pg), limit: "9" });
      if (search.trim()) params.set("search", search.trim());
      if (category) params.set("category", category);

      try {
        const res = await apiFetch(`/api/projects?${params.toString()}`, {
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
        if (res.ok) {
          const d = await res.json();
          setProjects(d.projects ?? []);
          setTotalPages(d.totalPages ?? 1);
          if (isInitial) {
            setStats(
              d.stats ?? { total: 0, featured: 0, thisMonth: 0, unembedded: 0 },
            );
            setUnembeddedIds(new Set(d.unembeddedIds ?? []));
          }
        }
      } catch (err) {
        if (isAbortError(err)) return;
        console.error("Failed to fetch projects:", err);
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
   * as `useRef(debounce(...)).current`, which reads a ref during render, and
   * `fetchProjects` itself touches `abortRef`. Creating it here keeps every ref
   * access out of the render phase and puts `cancel()` next to what it cancels.
   */
  const debouncedFetchRef = useRef<DebouncedFunc<
    (search: string, category: string | null, pg: number) => void
  > | null>(null);

  useEffect(() => {
    const fn = debounce(
      (search: string, category: string | null, pg: number) => {
        void fetchProjects(search, category, pg);
      },
      300,
    );
    debouncedFetchRef.current = fn;

    return () => {
      fn.cancel();
      debouncedFetchRef.current = null;
      abortRef.current?.abort();
    };
  }, [fetchProjects]);

  // Mount load for the category list, declared after the fetcher it calls.
  useEffect(() => {
    void (async () => {
      await fetchPortfolioCategories();
    })();
  }, []);

  useEffect(() => {
    void fetchProjects(searchQuery, selectedCategory, 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
    setIsSearching(true);
    debouncedFetchRef.current?.(value, selectedCategory, 1);
  };

  const handleCategorySelect = (category: string | null) => {
    setSelectedCategory(category);
    setPage(1);
    setIsSearching(true);
    void fetchProjects(searchQuery, category, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setIsSearching(true);
    void fetchProjects(searchQuery, selectedCategory, newPage);
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
      setProjectToDelete(null);
      setPage(1);
      void fetchProjects(searchQuery, selectedCategory, 1, true);
    } catch (error) {
      console.error("Error deleting project:", error);
      toast.error("Failed to delete project");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyImportPrompt = async () => {
    try {
      await navigator.clipboard.writeText(PORTFOLIO_IMPORT_PROMPT);
      toast.success("Instructions copied. Paste these into ChatGPT");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const runPortfolioImport = async (payload: Record<string, unknown>) => {
    setImportSubmitting(true);
    try {
      const res = await apiFetch("/api/projects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        added?: number;
        failed?: number;
        errors?: { index: number; message: string }[];
        embeddingWarnings?: { projectId: string; message: string }[];
      };

      if (!res.ok) {
        const msg =
          data.error ||
          (res.status === 422
            ? "Could not normalize the paste."
            : "Import failed");
        toast.error(msg);
        return;
      }

      const added = data.added ?? 0;
      const failed = data.failed ?? 0;
      if (failed > 0 && added > 0) {
        toast.success(`${added} portfolio(s) added, ${failed} failed`);
      } else if (failed > 0 && added === 0) {
        toast.error(
          `${failed} portfolio(s) could not be imported. Check the file or paste and try again.`,
        );
      } else {
        toast.success(`${added} portfolio(s) imported`);
      }

      if (data.errors?.length) {
        const sample = data.errors
          .slice(0, 3)
          .map((e) => `#${e.index + 1}: ${e.message}`)
          .join("; ");
        toast("Import row notes", {
          description: sample + (data.errors.length > 3 ? " …" : ""),
        });
      }

      if (data.embeddingWarnings?.length) {
        toast("Embeddings incomplete", {
          description:
            "Some embeddings could not be generated; smart portfolio matching may be limited until API keys are set.",
        });
      }

      setImportDialogOpen(false);
      setImportJsonText("");
      setPage(1);
      void fetchProjects(searchQuery, selectedCategory, 1, true);
      await fetchPortfolioCategories();
    } catch (e) {
      console.error(e);
      toast.error("Import request failed");
    } finally {
      setImportSubmitting(false);
    }
  };

  const handleImportJsonSubmit = async () => {
    const trimmed = importJsonText.trim();
    if (!trimmed) {
      toast.error("Paste ChatGPT's reply first");
      return;
    }
    await runPortfolioImport({ chatgptResponse: trimmed });
  };

  const handleCsvSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const input = e.target;
    if (!file) {
      input.value = "";
      return;
    }
    setImportSubmitting(true);
    try {
      let text: string;
      try {
        text = await file.text();
      } catch {
        toast.error("Could not read the CSV file");
        return;
      }
      if (!text.trim()) {
        toast.error("CSV file is empty");
        return;
      }
      await runPortfolioImport({ csv: text });
    } finally {
      input.value = "";
      setImportSubmitting(false);
    }
  };

  const handleOpenUpworkImport = async () => {
    setUpworkDialogState("checking");
    setUpworkItems([]);
    setUpworkSelectedIds(new Set());
    setUpworkImportResult(null);
    setUpworkAlreadyImportedCount(0);
    setUpworkImportDialogOpen(true);

    try {
      const res = await apiFetch("/api/upwork/portfolio");
      const data = (await res.json()) as {
        items?: UpworkPortfolioItem[];
        alreadyImportedCount?: number;
        error?: string;
      };

      if (!res.ok) {
        if (data.error === "not_connected") {
          setUpworkDialogState("not_connected");
        } else {
          toast.error(data.error ?? "Failed to load Upwork portfolio");
          setUpworkImportDialogOpen(false);
        }
        return;
      }

      const items = data.items ?? [];
      setUpworkItems(items);
      setUpworkAlreadyImportedCount(data.alreadyImportedCount ?? 0);
      setUpworkSelectedIds(new Set(items.map((_, i) => i)));
      setUpworkDialogState("preview");
    } catch {
      toast.error("Failed to reach Upwork API");
      setUpworkImportDialogOpen(false);
    }
  };

  const handleUpworkImport = async () => {
    const selectedItems = upworkItems.filter((_, i) =>
      upworkSelectedIds.has(i),
    );
    if (selectedItems.length === 0) return;
    setUpworkDialogState("importing");

    try {
      const res = await apiFetch("/api/upwork/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedItems,
        }),
      });
      const data = (await res.json()) as {
        added?: number;
        failed?: number;
        errors?: { index: number; message: string }[];
        embeddingWarnings?: { projectId: string; message: string }[];
        error?: string;
      };

      if (!res.ok) {
        toast.error(data.error ?? "Import failed");
        setUpworkDialogState("preview");
        return;
      }

      setUpworkImportResult({
        added: data.added ?? 0,
        failed: data.failed ?? 0,
        errors: data.errors,
        embeddingWarnings: data.embeddingWarnings,
      });
      setUpworkDialogState("done");

      setPage(1);
      void fetchProjects(searchQuery, selectedCategory, 1, true);
      await fetchPortfolioCategories();
    } catch {
      toast.error("Import request failed");
      setUpworkDialogState("preview");
    }
  };

  const toggleFeatured = async (
    id: string,
    currentStatus: boolean | null,
  ) => {
    try {
      const { error } = await supabase
        .from("projects")
        .update({ is_featured: !currentStatus })
        .eq("id", id);
      if (error) throw error;
      setProjects(
        projects.map((p) =>
          p.id === id ? { ...p, is_featured: !currentStatus } : p,
        ),
      );
      setStats((prev) => ({
        ...prev,
        featured: !currentStatus ? prev.featured + 1 : prev.featured - 1,
      }));
    } catch (error) {
      console.error("Error updating project:", error);
      toast.error("Failed to update project");
    }
  };

  const categories = portfolioCategories.map((c) => c.slug);
  /**
   * Embed every project that lacks a vector.
   *
   * Sequential, not parallel: each call spends the user's own OpenAI quota, and
   * a burst of concurrent requests is the fastest way to hit a rate limit on a
   * new key. The first missing-key response aborts the run; every subsequent
   * call would fail identically.
   */
  const handleBackfillEmbeddings = async () => {
    const ids = Array.from(unembeddedIds);
    if (ids.length === 0) return;

    setBackfilling(true);
    let embedded = 0;

    try {
      for (const id of ids) {
        const res = await apiFetch("/api/projects/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: id }),
        });

        if (res.ok) {
          embedded += 1;
          continue;
        }

        const data = await res.json().catch(() => ({}));
        if (data.code === "missing_key") {
          toast.error("Add your OpenAI API key first", {
            description: "Settings → AI Models. Then run the backfill again.",
          });
          break;
        }
        console.warn("[portfolio] backfill failed for", id, data.error);
      }

      if (embedded > 0) {
        toast.success(
          `Embedded ${embedded} project${embedded === 1 ? "" : "s"}.`,
        );
        void fetchProjects(searchQuery, selectedCategory, page, true);
      }
    } finally {
      setBackfilling(false);
    }
  };

  const hasProjects = stats.total > 0;

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 min-h-[50vh]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Loading portfolio…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Page header: title + primary CTA, always visible */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-normal">Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            Curate work to reference in proposals. Search, filter, or import in
            bulk.
          </p>
        </div>
        {/* Without a key the create page is a dead end, so the CTA says so
            here rather than letting the user walk into it. The banner below
            carries the explanation and the way to fix it. */}
        {aiKeyStatus === "missing" ? (
          <Button
            size="lg"
            disabled
            title="Add your OpenAI API key in Settings first"
            className="w-full shrink-0 sm:w-auto sm:mt-1"
          >
            Add Portfolio
          </Button>
        ) : (
          <Link href="/portfolios/new" className="shrink-0 sm:pt-1">
            <Button
              size="lg"
              className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-black shadow-md shadow-primary/15"
            >
              Add Portfolio
            </Button>
          </Link>
        )}
      </div>

      {aiKeyStatus === "missing" && <OpenAIKeyRequired variant="banner" className="mb-6" />}

      {/* Unified toolbar: search + actions + filters, always visible */}
      <div className="mb-8 rounded-xl border bg-card/80 shadow-sm backdrop-blur-sm">
        <div className="p-4 pb-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-4">
            <div className="relative min-w-0 flex-1 group xl:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 border-border/80 bg-background pl-9 pr-9 shadow-sm transition-shadow focus-visible:ring-2 focus-visible:ring-primary/20"
                placeholder="Search by name, client, or description…"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                aria-label="Search portfolios"
                disabled={!hasProjects}
              />
              {isSearching && (
                <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:shrink-0">
              <UpworkImportGate reason={upworkImportReason}>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={upworkImportReason !== null}
                  onClick={() => void handleOpenUpworkImport()}
                  className="border-border/80 bg-background shadow-sm gap-2"
                  title={
                    upworkImportReason ??
                    "Import portfolio items directly from your connected Upwork profile"
                  }
                >
                  <Download className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Import from Upwork</span>
                  <span className="sm:hidden">From Upwork</span>
                </Button>
              </UpworkImportGate>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setImportDialogOpen(true)}
                className="border-border/80 bg-background shadow-sm gap-2"
                title="Upload a CSV file or paste a ChatGPT reply to add multiple portfolio items at once"
              >
                <Upload className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">
                  Import multiple portfolios
                </span>
                <span className="sm:hidden">Bulk import</span>
              </Button>
            </div>
          </div>
        </div>
        <div className="border-t border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-2">
                Category
              </span>
              <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                <Button
                  variant={selectedCategory === null ? "default" : "outline"}
                  size="sm"
                  className="shrink-0 rounded-full px-4"
                  onClick={() => handleCategorySelect(null)}
                  disabled={!hasProjects}
                >
                  All
                </Button>
                {categories.map((category) => (
                  <Button
                    key={category}
                    variant={
                      selectedCategory === category ? "default" : "outline"
                    }
                    size="sm"
                    className="shrink-0 rounded-full px-4"
                    onClick={() => handleCategorySelect(category)}
                    disabled={!hasProjects}
                  >
                    {getCategoryLabel(category)}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 text-muted-foreground hover:text-foreground shrink-0"
              title="Manage categories"
              onClick={() => void openManageCategories()}
            >
              <Layers className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Manage categories</span>
              <span className="sm:hidden">Categories</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Bar, always visible */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-card border rounded-xl p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Portfolios</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-sm text-muted-foreground mb-1">Featured</p>
          <p className="text-2xl font-bold">{stats.featured}</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-sm text-muted-foreground mb-1">Categories</p>
          <p className="text-2xl font-bold">{portfolioCategories.length}</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-sm text-muted-foreground mb-1">This Month</p>
          <p className="text-2xl font-bold">{stats.thisMonth}</p>
        </div>
      </div>

      {/* Unembedded warning: new for this build; see `unembeddedIds` above. */}
      {stats.unembedded > 0 && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200/90 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/40 dark:bg-amber-950/25">
          <div className="flex gap-3">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-500"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                {stats.unembedded} project
                {stats.unembedded === 1 ? " is" : "s are"} not searchable yet
              </p>
              <p className="mt-0.5 text-xs text-amber-900/85 dark:text-amber-200/80">
                Projects are matched to jobs by meaning, which needs an embedding
                generated with your OpenAI key. Until then these are skipped when
                a proposal picks relevant work.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-2"
            onClick={() => void handleBackfillEmbeddings()}
            disabled={backfilling}
          >
            {backfilling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {backfilling ? "Embedding..." : "Backfill embeddings"}
          </Button>
        </div>
      )}

      {/* Content: empty state OR projects grid */}
      {!hasProjects ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-muted-foreground">No portfolio items yet</p>
        </div>
      ) : projects.length > 0 ? (
        <div className="pb-10">
          <div
            className={cn(
              "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
              isSearching &&
                "opacity-60 pointer-events-none transition-opacity",
            )}
          >
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-card border rounded-xl overflow-hidden hover:shadow-xl hover:shadow-primary/5 transition-all group flex flex-col"
              >
                {/* Color accent bar */}
                <div className="h-1.5 bg-linear-to-r from-primary/80 to-primary/20" />

                {/* Card Content */}
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-3">
                    <Badge
                      variant="outline"
                      className={`${getCategoryColor(
                        project.category || "",
                      )} text-xs font-bold uppercase`}
                    >
                      {getCategoryLabel(project.category || "")}
                    </Badge>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {unembeddedIds.has(project.id) && (
                        <span
                          title="No embedding yet. This project is skipped when matching jobs."
                          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Not searchable
                        </span>
                      )}
                      {project.is_featured && (
                        <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                      )}
                    </div>
                  </div>

                  <h3 className="text-lg font-bold mb-2 transition-colors">
                    {project.name}
                  </h3>

                  {project.client_name && (
                    <p className="text-sm text-muted-foreground mb-3">
                      Client: {project.client_name}
                    </p>
                  )}

                  {project.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2 flex-1">
                      {project.description}
                    </p>
                  )}

                  {/* Technologies */}
                  {project.technologies && project.technologies.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {project.technologies.slice(0, 3).map((tech, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-primary/10 border border-primary/30 text-primary rounded text-xs font-medium"
                        >
                          {tech}
                        </span>
                      ))}
                      {project.technologies.length > 3 && (
                        <span className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-medium">
                          +{project.technologies.length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-4 border-t">
                    {project.url?.trim() ? (
                      <a
                        href={project.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1"
                      >
                        <Button variant="outline" size="sm" className="w-full">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Visit Site
                        </Button>
                      </a>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled
                      >
                        No URL
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 hover:bg-yellow-500/10 hover:text-yellow-600"
                      title={project.is_featured ? "Unfeature" : "Feature"}
                      onClick={() =>
                        toggleFeatured(project.id, project.is_featured)
                      }
                    >
                      <Star
                        className={`h-5 w-5 ${
                          project.is_featured
                            ? "fill-yellow-500 text-yellow-500"
                            : ""
                        }`}
                      />
                    </Button>
                    <Link href={`/portfolios/${project.id}/edit`}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 hover:bg-primary/10 hover:text-primary"
                        title="Edit"
                      >
                        <Edit className="h-5 w-5" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 hover:bg-destructive/10 hover:text-destructive"
                      title="Delete"
                      onClick={() => setProjectToDelete(project)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
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
        </div>
      ) : (
        <div className="flex items-center justify-center h-64 bg-card rounded-xl border py-8">
          <div className="text-center">
            <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-semibold mb-2">No portfolios found</p>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search or filter criteria
            </p>
          </div>
        </div>
      )}

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk import portfolio</DialogTitle>
            <DialogDescription>
              Add many portfolio items at once: upload a CSV, or copy our
              prompt into ChatGPT and paste the reply here. Both need your
              OpenAI API key saved in Settings, because every imported project
              is embedded so it can be matched to a job.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium">CSV import</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Download the sample, keep the header row, one portfolio item per
                row. Use <span className="font-mono">|</span> or{" "}
                <span className="font-mono">;</span> between technologies. Leave
                <span className="font-mono"> url</span> empty when there is no
                link. Put any category label you want in{" "}
                <span className="font-mono">category</span>. Matching groups
                are created automatically if they do not exist yet. Optional
                columns: <span className="font-mono">image</span>,{" "}
                <span className="font-mono">featured</span> (yes/no).
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="lg" asChild>
                  <a
                    href="/portfolio-import-template.csv"
                    download="portfolio-import-template.csv"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download sample CSV
                  </a>
                </Button>
                <input
                  ref={csvInputRef}
                  id="portfolio-csv-upload"
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={handleCsvSelected}
                  disabled={importSubmitting}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={importSubmitting}
                  aria-busy={importSubmitting}
                  onClick={() => csvInputRef.current?.click()}
                >
                  {importSubmitting ? (
                    <>
                      <Loader2
                        className="h-4 w-4 mr-2 animate-spin"
                        aria-hidden
                      />
                      Importing…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" aria-hidden />
                      Upload CSV
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or paste from ChatGPT
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label htmlFor="portfolio-import-json">ChatGPT reply</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="shrink-0 gap-2 border-border/80"
                  onClick={handleCopyImportPrompt}
                  disabled={importSubmitting}
                  title="Copy the prompt to paste into ChatGPT"
                >
                  <Copy className="h-4 w-4 shrink-0" />
                  Copy prompt for ChatGPT
                </Button>
              </div>
              <Textarea
                id="portfolio-import-json"
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder="Paste ChatGPT's answer about your portfolio here…"
                className="field-sizing-fixed min-h-[200px] max-h-[min(45vh,320px)] overflow-y-auto text-sm leading-relaxed"
                disabled={importSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Use the button above to copy instructions, then paste them in
                ChatGPT. When you get the reply, paste it here and choose{" "}
                <span className="font-medium text-foreground">
                  Import from paste
                </span>
                .
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportDialogOpen(false)}
              disabled={importSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleImportJsonSubmit}
              disabled={importSubmitting}
            >
              {importSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing…
                </>
              ) : (
                "Import from paste"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={manageCatOpen}
        onOpenChange={(open) => {
          setManageCatOpen(open);
          if (!open) {
            setEditingCatId(null);
            setConfirmDeleteCatId(null);
            setNewCatName("");
            setNewCatColor("blue");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Portfolio Categories</DialogTitle>
            <DialogDescription>
              Add, rename, or remove categories used to organize your portfolio
              projects.
            </DialogDescription>
          </DialogHeader>

          {/* Add new category */}
          <div className="space-y-2">
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="New category name"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddCat();
                  }
                }}
                className="flex-1"
              />
              <Button
                onClick={() => void handleAddCat()}
                disabled={addingCat || !newCatName.trim()}
                className="shrink-0"
              >
                {addingCat ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {CAT_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setNewCatColor(opt.value)}
                  className={cn(
                    "h-5 w-5 rounded-full transition-all",
                    opt.bg,
                    newCatColor === opt.value
                      ? "ring-2 ring-offset-1 ring-primary scale-110"
                      : "opacity-60 hover:opacity-100",
                  )}
                  title={opt.value}
                />
              ))}
            </div>
          </div>

          {/* Category list */}
          <div className="border rounded-lg overflow-hidden divide-y max-h-72 overflow-y-auto">
            {catLoading ? (
              <div className="flex justify-center p-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : portfolioCategories.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No categories yet. Add your first category above.
              </div>
            ) : (
              portfolioCategories.map((cat) => {
                if (confirmDeleteCatId === cat.id) {
                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-3 bg-destructive/5"
                    >
                      <span className="text-sm">
                        Delete &quot;{cat.name}&quot;?
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={deletingCatId === cat.id}
                          onClick={() => void handleDeleteCat(cat.id)}
                        >
                          {deletingCatId === cat.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Delete"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmDeleteCatId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  );
                }
                if (editingCatId === cat.id) {
                  return (
                    <div key={cat.id} className="p-3 space-y-2 bg-muted/30">
                      <div className="flex gap-2 mb-3">
                        <Input
                          value={editCatName}
                          onChange={(e) => setEditCatName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleUpdateCat();
                            }
                            if (e.key === "Escape") setEditingCatId(null);
                          }}
                          className="flex-1 h-8 text-sm"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          onClick={() => void handleUpdateCat()}
                          disabled={!editCatName.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingCatId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {CAT_COLOR_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setEditCatColor(opt.value)}
                            className={cn(
                              "h-5 w-5 rounded-full transition-all",
                              opt.bg,
                              editCatColor === opt.value
                                ? "ring-2 ring-offset-1 ring-primary scale-110"
                                : "opacity-60 hover:opacity-100",
                            )}
                            title={opt.value}
                          />
                        ))}
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-3 group hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "w-3 h-3 rounded-full shrink-0",
                          CAT_COLOR_DOT[cat.color || "gray"] ?? "bg-gray-400",
                        )}
                      />
                      <span className="text-sm font-medium truncate">
                        {cat.name}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[11px] shrink-0"
                      >
                        {cat.slug}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingCatId(cat.id);
                          setEditCatName(cat.name);
                          setEditCatColor(cat.color || "blue");
                          setConfirmDeleteCatId(null);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setConfirmDeleteCatId(cat.id);
                          setEditingCatId(null);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageCatOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={projectToDelete !== null}
        onOpenChange={(open) =>
          !open && !isDeleting && setProjectToDelete(null)
        }
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete portfolio item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{projectToDelete?.name}
              &quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProjectToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                projectToDelete && void handleDelete(projectToDelete.id)
              }
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from Upwork dialog */}
      <Dialog
        open={upworkImportDialogOpen}
        onOpenChange={(open) => {
          if (!open && upworkDialogState !== "importing") {
            setUpworkImportDialogOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import from Upwork</DialogTitle>
          </DialogHeader>

          {/* Checking */}
          {upworkDialogState === "checking" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Checking your Upwork connection…
              </p>
            </div>
          )}

          {/* Not connected */}
          {upworkDialogState === "not_connected" && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Your Upwork account is not connected. Go to Settings →
                Integrations to connect it first.
              </p>
              <Button asChild variant="default">
                <Link href="/settings?tab=integrations">
                  Go to Settings → Integrations
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => setUpworkImportDialogOpen(false)}
              >
                Close
              </Button>
            </div>
          )}

          {/* Preview */}
          {upworkDialogState === "preview" && (
            <>
              <DialogDescription>
                {upworkItems.length > 0
                  ? `Found ${upworkItems.length} new portfolio item${upworkItems.length !== 1 ? "s" : ""} on your Upwork profile. Select which to import.`
                  : upworkAlreadyImportedCount > 0
                    ? `All ${upworkAlreadyImportedCount} portfolio item${upworkAlreadyImportedCount !== 1 ? "s" : ""} from your Upwork profile have already been imported.`
                    : "No portfolio items found on your Upwork profile."}
              </DialogDescription>
              <div
                className="flex items-center justify-between mb-2"
                hidden={upworkItems.length === 0}
              >
                <span className="text-sm text-muted-foreground">
                  {upworkSelectedIds.size} of {upworkItems.length} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (upworkSelectedIds.size === upworkItems.length) {
                      setUpworkSelectedIds(new Set());
                    } else {
                      setUpworkSelectedIds(
                        new Set(upworkItems.map((_, i) => i)),
                      );
                    }
                  }}
                >
                  {upworkSelectedIds.size === upworkItems.length
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </div>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {upworkItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {upworkAlreadyImportedCount > 0
                      ? "All your Upwork portfolio items have already been imported."
                      : "No portfolio items found on your Upwork profile."}
                  </p>
                ) : (
                  upworkItems.map((item, i) => (
                    <div
                      key={item.id || i}
                      className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors"
                    >
                      <Checkbox
                        id={`upwork-item-${i}`}
                        checked={upworkSelectedIds.has(i)}
                        onCheckedChange={(checked) => {
                          setUpworkSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(i);
                            else next.delete(i);
                            return next;
                          });
                        }}
                        className="mt-0.5 shrink-0"
                      />
                      <label
                        htmlFor={`upwork-item-${i}`}
                        className="flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm leading-tight">
                            {item.title}
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
                            {item.description}
                          </p>
                        )}
                        {item.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.skills.slice(0, 3).map((skill, si) => (
                              <span
                                key={si}
                                className="px-1.5 py-0.5 bg-primary/10 border border-primary/20 text-primary rounded text-[11px] font-medium"
                              >
                                {skill}
                              </span>
                            ))}
                            {item.skills.length > 3 && (
                              <span className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[11px]">
                                +{item.skills.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </label>
                    </div>
                  ))
                )}
              </div>
              {upworkItems.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Items will be added to your portfolio under the &quot;Upwork
                  Portfolio&quot; category.
                </p>
              )}
              <DialogFooter className="gap-2 sm:gap-4 mt-2">
                <Button
                  variant="outline"
                  onClick={() => setUpworkImportDialogOpen(false)}
                >
                  {upworkItems.length === 0 ? "Close" : "Cancel"}
                </Button>
                {upworkItems.length > 0 && (
                  <Button
                    onClick={() => void handleUpworkImport()}
                    disabled={upworkSelectedIds.size === 0}
                  >
                    Import {upworkSelectedIds.size} item
                    {upworkSelectedIds.size !== 1 ? "s" : ""}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}

          {/* Importing */}
          {upworkDialogState === "importing" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Importing {upworkSelectedIds.size} portfolio item
                {upworkSelectedIds.size !== 1 ? "s" : ""}…
              </p>
            </div>
          )}

          {/* Done */}
          {upworkDialogState === "done" && upworkImportResult && (
            <div className="flex flex-col gap-4 py-2">
              {upworkImportResult.added > 0 &&
                upworkImportResult.failed === 0 && (
                  <p className="text-sm font-medium text-green-600">
                    Successfully imported {upworkImportResult.added} portfolio
                    item{upworkImportResult.added !== 1 ? "s" : ""}!
                  </p>
                )}
              {upworkImportResult.added > 0 &&
                upworkImportResult.failed > 0 && (
                  <p className="text-sm">
                    <span className="font-medium text-green-600">
                      {upworkImportResult.added} imported
                    </span>
                    {", "}
                    <span className="font-medium text-amber-600">
                      {upworkImportResult.failed} skipped
                    </span>
                  </p>
                )}
              {upworkImportResult.added === 0 && (
                <p className="text-sm text-muted-foreground">
                  No items could be imported. Check errors below.
                </p>
              )}
              {upworkImportResult.errors &&
                upworkImportResult.errors.length > 0 && (
                  <div className="rounded-md border bg-destructive/5 p-3 text-xs text-destructive space-y-1">
                    {upworkImportResult.errors.slice(0, 5).map((e, i) => (
                      <p key={i}>
                        #{e.index + 1}: {e.message}
                      </p>
                    ))}
                  </div>
                )}
              {upworkImportResult.embeddingWarnings &&
                upworkImportResult.embeddingWarnings.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Some embeddings could not be generated; smart portfolio
                    matching may be limited until AI API keys are configured.
                  </p>
                )}
              <DialogFooter className="gap-2 sm:gap-4 mt-2">
                <Button
                  variant="outline"
                  onClick={() => setUpworkImportDialogOpen(false)}
                >
                  Close
                </Button>
                <Button asChild>
                  <Link href="/portfolios">View Portfolio</Link>
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
