"use client";

import {
  apiFetch,
  discardResponseBody,
  isAbortError,
} from "@/lib/api-fetch";
import {
  Plus,
  Search,
  Edit,
  Copy,
  Trash2,
  FileText,
  Clock,
  Loader2,
  Layers,
  Pencil,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import debounce from "lodash/debounce";
import type { DebouncedFunc } from "lodash";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useShallow } from "zustand/react/shallow";
import type { Template, TemplateInsert } from "@/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CAT_COLOR_OPTIONS = [
  { value: "blue", bg: "bg-blue-500" },
  { value: "indigo", bg: "bg-indigo-500" },
  { value: "green", bg: "bg-green-500" },
  { value: "pink", bg: "bg-pink-500" },
  { value: "amber", bg: "bg-amber-500" },
  { value: "orange", bg: "bg-orange-500" },
  { value: "cyan", bg: "bg-cyan-500" },
  { value: "emerald", bg: "bg-emerald-500" },
  { value: "violet", bg: "bg-violet-500" },
  { value: "rose", bg: "bg-rose-500" },
];

const CAT_COLOR_DOT: Record<string, string> = {
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  green: "bg-green-500",
  pink: "bg-pink-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  cyan: "bg-cyan-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  gray: "bg-gray-400",
};

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

export default function TemplatesPage() {
  const { user } = useAuthStore(useShallow((state) => ({ user: state.user })));

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<
    string | null
  >(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [baseCount, setBaseCount] = useState(-1);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [portfolioCategories, setPortfolioCategories] = useState<
    { id: string; name: string; slug: string; color: string | null }[]
  >([]);

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

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/api/settings/portfolio-categories");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setPortfolioCategories(data.categories || []);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const categoryLabels = useMemo(
    () => Object.fromEntries(portfolioCategories.map((c) => [c.slug, c.name])),
    [portfolioCategories],
  );
  const categoryColors = useMemo(
    () =>
      Object.fromEntries(
        portfolioCategories.map((c) => [
          c.slug,
          CATEGORY_COLOR_CLASSES[c.color || "gray"] ||
            "bg-gray-500/10 text-gray-600 border-gray-500/20",
        ]),
      ),
    [portfolioCategories],
  );

  const getCategoryLabel = (slug: string) =>
    slug
      ? (categoryLabels[slug] ??
        slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " "))
      : "-";

  const getCategoryColor = (slug: string) =>
    slug
      ? (categoryColors[slug] ??
        "bg-gray-500/10 text-gray-600 border-gray-500/20")
      : "bg-gray-500/10 text-gray-600 border-gray-500/20";

  const openManageCategories = async () => {
    setManageCatOpen(true);
    setCatLoading(true);
    try {
      const res = await apiFetch("/api/settings/portfolio-categories");
      const data = (await res.json()) as {
        categories?: {
          id: string;
          name: string;
          slug: string;
          color: string | null;
        }[];
      };
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
      const data = (await res.json()) as {
        error?: string;
        category?: {
          id: string;
          name: string;
          slug: string;
          color: string | null;
        };
      };
      if (res.ok) {
        setPortfolioCategories((prev) => [...prev, data.category!]);
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
      const data = (await res.json()) as {
        error?: string;
        category?: {
          id: string;
          name: string;
          slug: string;
          color: string | null;
        };
      };
      if (res.ok) {
        setPortfolioCategories((prev) =>
          prev.map((c) => (c.id === editingCatId ? data.category! : c)),
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
        {
          method: "DELETE",
        },
      );
      const data = (await res.json()) as { error?: string };
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

  const fetchTemplates = useCallback(
    async (
      search: string,
      category: string | null,
      pg: number,
      isInitial = false,
    ) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      const params = new URLSearchParams({ page: String(pg), limit: "6" });
      if (search.trim()) params.set("search", search.trim());
      if (category) params.set("category", category);

      try {
        const res = await apiFetch(`/api/templates?${params.toString()}`, {
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
          throw new Error(data.error || "Failed to fetch templates");
        }
        const data = await res.json();
        setTemplates(data.templates ?? []);
        setTotalPages(data.totalPages ?? 1);
        if (isInitial) setBaseCount(data.totalCount ?? 0);
      } catch (e) {
        if (isAbortError(e)) return;
        console.error("Error fetching templates:", e);
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
    (search: string, category: string | null, pg: number) => void
  > | null>(null);

  useEffect(() => {
    const fn = debounce((search: string, category: string | null, pg: number) => {
      void fetchTemplates(search, category, pg);
    }, 300);
    debouncedFetchRef.current = fn;

    return () => {
      fn.cancel();
      debouncedFetchRef.current = null;
      abortRef.current?.abort();
    };
  }, [fetchTemplates]);

  useEffect(() => {
    void fetchTemplates("", null, 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
    setIsSearching(true);
    debouncedFetchRef.current?.(value, selectedCategorySlug, 1);
  };

  const handleCategorySelect = (slug: string | null) => {
    setSelectedCategorySlug(slug);
    setPage(1);
    setIsSearching(true);
    void fetchTemplates(searchQuery, slug, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setIsSearching(true);
    void fetchTemplates(searchQuery, selectedCategorySlug, newPage);
  };

  const confirmDeleteTemplate = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("templates")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      setDeleteTarget(null);
      setPage(1);
      void fetchTemplates(searchQuery, selectedCategorySlug, 1, true);
    } catch (error) {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete template");
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async (template: Template) => {
    if (!user?.id) {
      toast.error("You must be signed in to duplicate a template.");
      return;
    }
    try {
      const row: TemplateInsert = {
        name: `${template.name} (Copy)`,
        category: template.category,
        content: template.content,
        variables: template.variables,
        is_default: false,
        user_id: user!.id,
      };
      const { error } = await supabase.from("templates").insert(row);
      if (error) throw error;
      toast.success("Template duplicated successfully!");
      setPage(1);
      void fetchTemplates(searchQuery, selectedCategorySlug, 1, true);
    } catch (error) {
      console.error("Error duplicating template:", error);
      toast.error("Failed to duplicate template");
    }
  };

  const hasTemplates = baseCount > 0;

  const handleDeleteDialogOpenChange = (open: boolean) => {
    if (!open) {
      if (deleting) return;
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {loading ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 min-h-[50vh]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Loading templates…
          </span>
        </div>
      ) : hasTemplates ? (
        <>
          {/* Page Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">Templates</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Reusable proposal drafts with dynamic variables.
              </p>
            </div>
            <Link href="/templates/new">
              <Button className="bg-primary hover:bg-primary/90 text-black shadow-lg shadow-primary/20">
                Create Template
              </Button>
            </Link>
          </div>

          {/* Unified toolbar: search + category filters */}
          <div className="mb-8 rounded-xl border bg-card/80 shadow-sm backdrop-blur-sm">
            <div className="p-4 pb-3">
              <div className="relative group max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  className="h-10 border-border/80 bg-background pl-9 pr-9 shadow-sm"
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
                {isSearching && (
                  <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
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
                      variant={
                        selectedCategorySlug === null ? "default" : "outline"
                      }
                      size="sm"
                      className="shrink-0 rounded-full px-4"
                      onClick={() => handleCategorySelect(null)}
                    >
                      All
                    </Button>
                    {portfolioCategories.map((c) => (
                      <Button
                        key={c.id}
                        variant={
                          selectedCategorySlug === c.slug
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        className="shrink-0 rounded-full px-4"
                        onClick={() => handleCategorySelect(c.slug)}
                      >
                        {c.name}
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

          {/* Templates Grid */}
          {templates.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No templates match your search.
            </p>
          ) : (
            <>
              <div
                className={cn(
                  "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8",
                  isSearching &&
                    "opacity-60 pointer-events-none transition-opacity",
                )}
              >
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="bg-card border rounded-xl overflow-hidden hover:shadow-xl hover:shadow-primary/5 transition-all group flex flex-col"
                  >
                    {/* Card Content */}
                    <div className="p-6 flex-1">
                      <div className="flex justify-between items-start mb-4">
                        <span
                          className={`px-3 py-1 text-xs font-semibold rounded-full border ${getCategoryColor(template.category)}`}
                        >
                          {getCategoryLabel(template.category)}
                        </span>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span className="text-xs font-medium">
                            {template.variables?.length || 0} variables
                          </span>
                        </div>
                      </div>

                      <h3 className="text-lg font-bold mb-3 transition-colors">
                        {template.name}
                      </h3>

                      <div className="space-y-3 mb-6">
                        <div className="flex flex-wrap gap-2">
                          {template.variables
                            ?.slice(0, 3)
                            .map((variable, index) => (
                              <span
                                key={index}
                                className="px-2 py-1 bg-primary/10 border border-primary/30 text-primary rounded text-xs font-mono"
                              >
                                {`{{${variable}}}`}
                              </span>
                            ))}
                          {template.variables &&
                            template.variables.length > 3 && (
                              <span className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs">
                                +{template.variables.length - 3} more
                              </span>
                            )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
                        <Clock className="h-4 w-4" />
                        <span>
                          Created{" "}
                          {template.created_at
                            ? new Date(template.created_at).toLocaleDateString()
                            : "-"}
                        </span>
                      </div>
                    </div>

                    {/* Actions Section */}
                    <div className="px-6 py-4 bg-muted/50 border-t flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {template.is_default ? "Default Template" : "Custom"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Link href={`/templates/${template.id}/edit`}>
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
                          className="h-9 w-9 hover:bg-primary/10 hover:text-primary"
                          title="Duplicate"
                          onClick={() => void handleDuplicate(template)}
                        >
                          <Copy className="h-5 w-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 hover:bg-destructive/10 hover:text-destructive"
                          title="Delete"
                          onClick={() =>
                            setDeleteTarget({
                              id: template.id,
                              name: template.name,
                            })
                          }
                          disabled={template.is_default ?? false}
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>

                    {/* Use Template Button */}
                    <div className="px-6 pb-6 pt-2">
                      <Link href={`/proposals/new?template=${template.id}`}>
                        <Button className="w-full bg-primary/10 hover:bg-primary text-primary hover:text-white transition-all">
                          <FileText className="h-4 w-4 mr-2" />
                          Use Template
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

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
            </>
          )}
        </>
      ) : (
        /* Empty State */
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="mb-8 flex justify-center">
              <div className="relative">
                <div className="w-32 h-32 bg-muted/50 rounded-3xl flex items-center justify-center">
                  <div className="w-20 h-20 bg-background rounded-2xl shadow-lg flex items-center justify-center relative">
                    <FileText className="h-10 w-10 text-primary" />
                  </div>
                </div>
                <div className="absolute -bottom-2 -right-2 w-16 h-16 bg-primary rounded-full opacity-80" />
              </div>
            </div>

            <h2 className="text-3xl font-bold mb-4">No templates yet</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Create your first proposal template with dynamic variables to
              automate your workflow.
            </p>

            <Link href="/templates/new">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-black shadow-lg shadow-primary/20 mb-4"
              >
                Create Template
              </Button>
            </Link>

            <div className="mt-6">
              <span
                className="text-sm text-muted-foreground inline-flex items-center gap-1 cursor-default"
                title="Use {{variable_name}} syntax in your templates to create dynamic placeholders. Common variables: client_name, project_description, budget, timeline."
              >
                Variable Reference: use {"{{variable_name}}"} syntax
              </span>
            </div>
          </div>
        </div>
      )}

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
            <DialogTitle>Manage Categories</DialogTitle>
            <DialogDescription>
              Add, rename, or remove categories used to organize your templates.
            </DialogDescription>
          </DialogHeader>

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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={handleDeleteDialogOpenChange}
      >
        <AlertDialogContent aria-busy={deleting}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteTarget?.name}&quot;.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              className="gap-2"
              onClick={confirmDeleteTemplate}
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
