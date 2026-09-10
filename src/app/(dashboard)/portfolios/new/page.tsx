"use client";

import { apiFetch } from "@/lib/api-fetch";
import { useOpenAIKeyStatus } from "@/lib/ai/use-openai-key-status";
import { OpenAIKeyRequired } from "@/components/portfolio/OpenAIKeyRequired";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Info,
  FileText,
  Terminal,
  Eye,
  X,
  Plus,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Check,
  Sparkles,
  Loader2,
} from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createProjectSchema } from "@/lib/portfolio/project-schema";
import { embedProjectAfterSave } from "@/lib/portfolio/embed-after-save";
// import { useAuth } from "@/lib/auth/auth-context";
import { useAuthStore } from "@/lib/auth/auth-store";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";

const COLOR_OPTIONS = [
  { value: "blue", label: "Blue", class: "bg-blue-500" },
  { value: "indigo", label: "Indigo", class: "bg-indigo-500" },
  { value: "green", label: "Green", class: "bg-green-500" },
  { value: "lime", label: "Lime", class: "bg-lime-500" },
  { value: "pink", label: "Pink", class: "bg-pink-500" },
  { value: "amber", label: "Amber", class: "bg-amber-500" },
  { value: "orange", label: "Orange", class: "bg-orange-500" },
  { value: "cyan", label: "Cyan", class: "bg-cyan-500" },
  { value: "emerald", label: "Emerald", class: "bg-emerald-500" },
  { value: "violet", label: "Violet", class: "bg-violet-500" },
];

export default function NewPortfolioPage() {
  const router = useRouter();
  const { user } = useAuthStore(useShallow((state) => ({ user: state.user })));
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const aiKeyStatus = useOpenAIKeyStatus();
  const [analyzing, setAnalyzing] = useState(false);

  // Form state
  const [projectName, setProjectName] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [category, setCategory] = useState<string>("");
  const [portfolioCategories, setPortfolioCategories] = useState<
    { id: string; name: string; slug: string; color: string | null }[]
  >([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // add some test console for deployment

  useEffect(() => {
    apiFetch("/api/settings/portfolio-categories")
      .then((r) => r.json())
      .then((data) => {
        const cats = data.categories || [];
        setPortfolioCategories(cats);
        if (cats.length > 0) {
          setCategory((prev) => (prev ? prev : cats[0].slug));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingCategories(false));
  }, []);
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [techStack, setTechStack] = useState<string[]>([
    "Next.js",
    "Tailwind CSS",
  ]);
  const [newTech, setNewTech] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("blue");
  const [savingCategory, setSavingCategory] = useState(false);

  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    description: true,
    technical: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const addTech = () => {
    if (newTech.trim() && !techStack.includes(newTech.trim())) {
      setTechStack([...techStack, newTech.trim()]);
      setNewTech("");
    }
  };

  const removeTech = (tech: string) => {
    setTechStack(techStack.filter((t) => t !== tech));
  };

  const handleSave = async () => {
    if (portfolioCategories.length === 0) {
      toast.error("Please create a category first before saving a project");
      return;
    }

    if (!isSupabaseConfigured) {
      toast.error(
        "Supabase is not configured. Please check your environment variables.",
      );
      return;
    }

    const payload = {
      name: projectName.trim(),
      url: projectUrl.trim() || null,
      category,
      client_name: clientName.trim() || null,
      description: description.trim() || null,
      technologies: techStack,
      is_featured: isFeatured,
    };

    const parsed = createProjectSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      toast.error(firstIssue?.message ?? "Please check your inputs");
      return;
    }

    if (!user?.id) {
      toast.error("You must be signed in to save a portfolio project.");
      return;
    }

    setSaving(true);

    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save project");

      const savedProject = data.project;

      setSaveSuccess(true);
      toast.success("Project saved");

      // Wait for the embedding before showing the list, so the list tells the
      // truth. A key is required to get this far, so a failure here is
      // transient (a rate limit, a revoked key, an OpenAI outage) rather than a
      // setup step the user forgot — and it never endangers the save, which is
      // already committed above.
      if (savedProject?.id) {
        const embedResult = await embedProjectAfterSave(savedProject.id);
        if (embedResult === "missing_key") {
          toast.warning("Saved, but not searchable yet", {
            description:
              "Your OpenAI key stopped working, so this project has no embedding. Check it in Settings, then backfill from the portfolio list.",
          });
        }
      }

      router.push("/portfolios");
    } catch (err) {
      console.error("Error saving project:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to save project",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error("Please enter a category name");
      return;
    }
    setSavingCategory(true);
    try {
      const res = await apiFetch("/api/settings/portfolio-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim(), color: newCategoryColor }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create category");
        return;
      }
      const newCat = data.category as { id: string; name: string; slug: string; color: string | null };
      setPortfolioCategories((prev) => [...prev, newCat]);
      setCategory(newCat.slug);
      setShowCategoryDialog(false);
      setNewCategoryName("");
      setNewCategoryColor("blue");
      toast.success("Category created");
    } catch {
      toast.error("Failed to create category");
    } finally {
      setSavingCategory(false);
    }
  };

  const handleCancel = () => {
    if (projectName || description || projectUrl) {
      if (
        confirm("You have unsaved changes. Are you sure you want to leave?")
      ) {
        router.push("/portfolios");
      }
    } else {
      router.push("/portfolios");
    }
  };

  const handleAnalyzeUrl = async () => {
    if (!projectUrl.trim()) {
      toast.error("Please enter a project URL first");
      return;
    }

    setAnalyzing(true);

    try {
      const res = await apiFetch("/api/projects/analyze-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: projectUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        // The route answers `missing_api_key` when no OpenAI key is saved. That
        // is a setup step, not a failure, so it points at Settings rather than
        // reading as a broken feature.
        if (data.code === "missing_api_key") {
          toast.error(data.error || "Add your OpenAI API key in Settings.", {
            description: "Settings → AI Models",
          });
          return;
        }
        toast.error(data.error || "Failed to analyze URL");
        return;
      }

      // Auto-fill fields with AI results
      if (data.name && !projectName) setProjectName(data.name);
      if (data.description) setDescription(data.description);
      if (data.technologies?.length) setTechStack(data.technologies);
      if (data.category) setCategory(data.category);
      if (data.client_name && !clientName) setClientName(data.client_name);
    } catch {
      toast.error("Failed to analyze URL. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Link
              href="/portfolios"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Portfolio
            </Link>
            <h1 className="text-3xl font-bold tracking-normal">
              Add Portfolio Project
            </h1>
            <p className="text-muted-foreground">
              Add a portfolio project to showcase in your proposals
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saveSuccess && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Check className="h-4 w-4" />
                Saved successfully!
              </span>
            )}
          </div>
        </div>

        {/* The key is required to create a project, so it is asked for before
            the form rather than after a filled-in one is rejected. `checking`
            renders nothing: a gate that flashes on every load would read as an
            error the user has to dismiss. */}
        {aiKeyStatus === "missing" ? (
          <OpenAIKeyRequired />
        ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          {/* Form Section */}
          <div className="space-y-4">
            {/* Basic Information */}
            <Card>
              <CardHeader
                className="cursor-pointer"
                onClick={() => toggleSection("basic")}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Info className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Basic Information</CardTitle>
                      <CardDescription>
                        Project name, category, and URL
                      </CardDescription>
                    </div>
                  </div>
                  {expandedSections.basic ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
              {expandedSections.basic && (
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="projectName">
                        Project Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="projectName"
                        placeholder="E-commerce Platform"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="projectUrl">
                        Project URL{" "}
                        <span className="text-muted-foreground font-normal">
                          (optional)
                        </span>
                      </Label>
                      <div className="flex flex-wrap gap-2 items-center">
                        <Input
                          id="projectUrl"
                          type="url"
                          placeholder="https://example.com"
                          value={projectUrl}
                          onChange={(e) => setProjectUrl(e.target.value)}
                          className="min-w-0 flex-1"
                        />
                        {!projectUrl.trim() ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-block shrink-0">
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled
                                  className="gap-2 border-muted-foreground/25 text-muted-foreground"
                                >
                                  <Sparkles className="h-4 w-4 opacity-60" />
                                  AI Auto-fill
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Enter a project URL to use AI Auto-fill.
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleAnalyzeUrl}
                            disabled={analyzing}
                            className="shrink-0 gap-2 border-input bg-background hover:bg-accent hover:text-accent-foreground"
                          >
                            {analyzing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                            {analyzing ? "Analyzing..." : "AI Auto-fill"}
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Runs against your own OpenAI key.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="category">
                        Category <span className="text-destructive">*</span>
                      </Label>
                      {loadingCategories ? (
                        <Skeleton className="h-9 w-full" />
                      ) : portfolioCategories.length === 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCategoryDialog(true)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add New Category
                        </Button>
                      ) : (
                        <Select value={category} onValueChange={setCategory}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {portfolioCategories.map((c) => (
                              <SelectItem key={c.id} value={c.slug}>
                                {c.name}
                              </SelectItem>
                            ))}
                            <SelectSeparator />
                            <div className="p-1 pt-0">
                              <button
                                type="button"
                                className="flex w-full items-center gap-1.5 rounded-sm px-2 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                onPointerDown={(e) => e.preventDefault()}
                                onClick={() => setShowCategoryDialog(true)}
                              >
                                <Plus className="h-3 w-3" />
                                Add new category
                              </button>
                            </div>
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="clientName">Client Name</Label>
                      <Input
                        id="clientName"
                        placeholder="Acme Corporation"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="featured"
                      checked={isFeatured}
                      onChange={(e) => setIsFeatured(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="featured" className="cursor-pointer">
                      Feature this project (show first in lists)
                    </Label>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Description */}
            <Card>
              <CardHeader
                className="cursor-pointer"
                onClick={() => toggleSection("description")}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Description</CardTitle>
                      <CardDescription>
                        Project overview and details
                      </CardDescription>
                    </div>
                  </div>
                  {expandedSections.description ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
              {expandedSections.description && (
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="description">Project Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Describe what you built and what problems you solved..."
                      rows={6}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Technical Details */}
            <Card>
              <CardHeader
                className="cursor-pointer"
                onClick={() => toggleSection("technical")}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Terminal className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Technologies</CardTitle>
                      <CardDescription>
                        Tech stack used in this project
                      </CardDescription>
                    </div>
                  </div>
                  {expandedSections.technical ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
              {expandedSections.technical && (
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tech Stack</Label>
                    <div className="flex flex-wrap gap-2 rounded-lg border p-3 min-h-[60px]">
                      {techStack.map((tech) => (
                        <Badge
                          key={tech}
                          variant="secondary"
                          className="gap-1 pr-1"
                        >
                          {tech}
                          <button
                            type="button"
                            onClick={() => removeTech(tech)}
                            className="ml-1 rounded-sm hover:bg-muted"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add technology"
                        value={newTech}
                        onChange={(e) => setNewTech(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTech();
                          }
                        }}
                      />
                      <Button type="button" onClick={addTech} variant="outline">
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <Button variant="outline" size="lg" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90"
                onClick={handleSave}
                disabled={saving || saveSuccess}
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : saveSuccess ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Saved!
                  </>
                ) : (
                  "Save Project"
                )}
              </Button>
            </div>
          </div>

          {/* Live Preview Panel */}
          <div className="lg:sticky lg:top-8 h-fit">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" />
                  <CardTitle>Live Preview</CardTitle>
                </div>
                <CardDescription>How your project will appear</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Project Card Preview */}
                  <div className="bg-card border rounded-xl overflow-hidden">
                    {/* Content */}
                    <div className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <Badge variant="outline" className="text-xs">
                          {category
                            ? portfolioCategories.find(
                                (c) => c.slug === category,
                              )?.name ||
                              category.charAt(0).toUpperCase() +
                                category.slice(1).replace(/-/g, " ")
                            : "Category"}
                        </Badge>
                        {isFeatured && (
                          <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                            Featured
                          </Badge>
                        )}
                      </div>

                      <h3 className="font-semibold text-lg">
                        {projectName || "Project Name"}
                      </h3>

                      {clientName && (
                        <p className="text-sm text-muted-foreground">
                          Client: {clientName}
                        </p>
                      )}

                      {description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {description}
                        </p>
                      )}

                      {techStack.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {techStack.slice(0, 3).map((tech) => (
                            <Badge
                              key={tech}
                              variant="secondary"
                              className="text-xs"
                            >
                              {tech}
                            </Badge>
                          ))}
                          {techStack.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{techStack.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        )}
      </div>
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add New Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="newCategoryName">Category Name</Label>
              <Input
                id="newCategoryName"
                placeholder="e.g. E-commerce"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddCategory();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewCategoryColor(opt.value)}
                    className={cn(
                      "h-6 w-6 rounded-full transition-all",
                      opt.class,
                      newCategoryColor === opt.value
                        ? "ring-2 ring-offset-2 ring-primary scale-110"
                        : "opacity-70 hover:opacity-100",
                    )}
                    title={opt.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCategoryDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleAddCategory()}
              disabled={savingCategory || !newCategoryName.trim()}
            >
              {savingCategory ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Add Category"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
