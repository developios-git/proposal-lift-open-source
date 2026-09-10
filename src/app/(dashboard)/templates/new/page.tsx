"use client";

import { apiFetch } from "@/lib/api-fetch";
import {
  ArrowLeft,
  Save,
  Plus,
  Eye,
  Copy,
  Check,
  Sparkles,
  Loader2,
  Info,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

const COLOR_OPTIONS = [
  { value: "blue", label: "Blue", class: "bg-blue-500" },
  { value: "indigo", label: "Indigo", class: "bg-indigo-500" },
  { value: "violet", label: "Violet", class: "bg-violet-500" },
  { value: "pink", label: "Pink", class: "bg-pink-500" },
  { value: "rose", label: "Rose", class: "bg-rose-500" },
  { value: "orange", label: "Orange", class: "bg-orange-500" },
  { value: "amber", label: "Amber", class: "bg-amber-500" },
  { value: "green", label: "Green", class: "bg-green-500" },
  { value: "teal", label: "Teal", class: "bg-teal-500" },
  { value: "cyan", label: "Cyan", class: "bg-cyan-500" },
];

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

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
// import { useAuth } from "@/lib/auth/auth-context";
import { useAuthStore } from "@/lib/auth/auth-store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";

const GUIDE_VIDEO_URL =
  "https://www.tella.tv/video/vid_cmnimhogn006104lbc1kxazl0/embed?b=1&title=1&a=1&loop=0&t=0&muted=0&wt=1&o=1";

const availableSections = [
  {
    icon: "📝",
    title: "Introduction",
    description: "Standard opening",
    template: `\n## Introduction\n\nDear {{client_name}},\n\nThank you for considering us for your project. I am excited to present this proposal for {{project_description}}.\n\n`,
  },
  {
    icon: "⭐",
    title: "Experience",
    description: "Case studies",
    template: `\n## Our Experience\n\nWe have successfully delivered similar projects, including:\n\n- {{project_1}}\n- {{project_2}}\n- {{project_3}}\n\n`,
  },
  {
    icon: "📚",
    title: "Approach",
    description: "Methodology",
    template: `\n## Our Approach\n\nOur methodology includes:\n\n1. {{phase_1}}\n2. {{phase_2}}\n3. {{phase_3}}\n\nThis ensures {{outcome}}.\n\n`,
  },
  {
    icon: "💰",
    title: "Budget",
    description: "Pricing tables",
    template: `\n## Investment\n\nProject Cost: {{budget}}\nTimeline: {{timeline}}\nPayment Terms: {{payment_terms}}\n\n`,
  },
  {
    icon: "📅",
    title: "Timeline",
    description: "Project milestones",
    template: `\n## Timeline\n\nPhase 1: {{phase_1_timeline}}\nPhase 2: {{phase_2_timeline}}\nPhase 3: {{phase_3_timeline}}\n\nExpected completion: {{completion_date}}\n\n`,
  },
  {
    icon: "✉️",
    title: "Call to Action",
    description: "Next steps",
    template: `\n## Next Steps\n\nI would love to discuss this further. Please feel free to:\n\n- Schedule a call at {{calendar_link}}\n- Reply to this message\n- Call me at {{phone}}\n\nLooking forward to working together!\n\nBest regards,\n{{your_name}}\n`,
  },
];

export default function CreateTemplatePage() {
  const router = useRouter();
  const { user } = useAuthStore(
    useShallow((state) => ({
      user: state.user,
    })),
  );

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPurpose, setAiPurpose] = useState("");

  // Form state
  const [templateName, setTemplateName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState(
    `Dear {{client_name}},\n\nWe are thrilled to present this proposal for your upcoming project. Based on our initial discovery call, we understand you are looking for a partner to scale your platform. Given our experience with {{relevant_project_1}}, we are confident in our ability to deliver results.\n\nStart typing here to expand your template...`,
  );

  const [portfolioCategories, setPortfolioCategories] = useState<
    { id: string; name: string; slug: string; color: string | null }[]
  >([]);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("blue");
  const [savingCategory, setSavingCategory] = useState(false);

  // Manage categories CRUD dialog
  const [manageCatOpen, setManageCatOpen] = useState(false);
  const [catLoading, setCatLoading] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("blue");
  const [addingCat, setAddingCat] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatColor, setEditCatColor] = useState("blue");
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    void apiFetch("/api/settings/portfolio-categories")
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json() as Promise<{
          categories?: {
            id: string;
            name: string;
            slug: string;
            color: string | null;
          }[];
        }>;
      })
      .then((data) => {
        if (cancelled || !data) return;
        const cats = data.categories ?? [];
        setPortfolioCategories(cats);
        if (cats.length > 0) {
          setCategory((prev) => (prev ? prev : cats[0].slug));
        }
      })
      .catch(() => {
        if (!cancelled) setPortfolioCategories([]);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Extract variables from content
  const extractVariables = (text: string): string[] => {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = text.match(regex);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "").trim()))];
  };

  const variables = extractVariables(content);

  // Sample data for preview
  const sampleData: Record<string, string> = {
    client_name: "Jane Smith",
    relevant_project_1: "The Global Logistics Dashboard",
    project_description: "e-commerce platform",
    project_1: "E-commerce platform with 100k+ monthly users",
    project_2: "Custom CRM system for enterprise client",
    project_3: "Mobile-first web application for fintech startup",
    phase_1: "Discovery & Planning",
    phase_2: "Design & Development",
    phase_3: "Testing & Deployment",
    outcome: "a smooth, predictable delivery",
    budget: "$15,000 - $25,000",
    timeline: "8-12 weeks",
    payment_terms: "50% upfront, 50% on completion",
    phase_1_timeline: "Weeks 1-2",
    phase_2_timeline: "Weeks 3-8",
    phase_3_timeline: "Weeks 9-12",
    completion_date: "End of Q2 2024",
    calendar_link: "calendly.com/yourname",
    phone: "+1 (555) 123-4567",
    your_name: "Alex Rivera",
  };

  // Replace variables in content
  const renderPreview = (): string => {
    let preview = content;
    Object.entries(sampleData).forEach(([key, value]) => {
      preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    });
    return preview;
  };

  // Calculate stats
  const wordCount = content.trim().split(/\s+/).length;
  const readTime = Math.ceil(wordCount / 200); // Average reading speed: 200 words/min

  // Insert section at cursor position
  const insertSection = (sectionTemplate: string) => {
    if (!contentRef.current) return;

    const textarea = contentRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent =
      content.substring(0, start) + sectionTemplate + content.substring(end);

    setContent(newContent);

    // Set cursor position after inserted content
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + sectionTemplate.length,
        start + sectionTemplate.length,
      );
    }, 0);
  };

  // Insert variable at cursor position
  const insertVariable = (variableName: string) => {
    if (!contentRef.current) return;

    const textarea = contentRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const variable = `{{${variableName}}}`;
    const newContent =
      content.substring(0, start) + variable + content.substring(end);

    setContent(newContent);

    // Set cursor position after inserted variable
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + variable.length,
        start + variable.length,
      );
    }, 0);
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
        body: JSON.stringify({
          name: newCategoryName.trim(),
          color: newCategoryColor,
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
      if (!res.ok) {
        toast.error(data.error || "Failed to create category");
        return;
      }
      const newCat = data.category!;
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

  const openManageCategories = async () => {
    setManageCatOpen(true);
    setCatLoading(true);
    try {
      const res = await apiFetch("/api/settings/portfolio-categories");
      const data = (await res.json()) as {
        categories?: { id: string; name: string; slug: string; color: string | null }[];
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
        category?: { id: string; name: string; slug: string; color: string | null };
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
        body: JSON.stringify({ id: editingCatId, name: editCatName.trim(), color: editCatColor }),
      });
      const data = (await res.json()) as {
        error?: string;
        category?: { id: string; name: string; slug: string; color: string | null };
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
      const res = await apiFetch(`/api/settings/portfolio-categories?id=${id}`, {
        method: "DELETE",
      });
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

  // Save template to Supabase
  const handleSave = async () => {
    // Validation
    if (!templateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    if (!content.trim()) {
      toast.error("Template content cannot be empty");
      return;
    }

    if (portfolioCategories.length === 0) {
      toast.error("Please add at least one category.");
      return;
    }

    if (!category) {
      toast.error("Please select a category");
      return;
    }

    setSaving(true);

    try {
      if (!user?.id) {
        toast.error("You must be signed in to save a template.");
        setSaving(false);
        return;
      }

      const res = await apiFetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          category,
          content,
          description,
          variables,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to save template");

      setSaveSuccess(true);

      // Leave for the list the same way the edit page does. Without this the
      // form sits on a permanently disabled "Saved!" button, and the only way
      // to write a second template is a manual reload.
      setTimeout(() => {
        router.push("/templates");
      }, 1000);
    } catch (err) {
      console.error("Error saving template:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to save template",
      );
    } finally {
      setSaving(false);
    }
  };

  // Copy preview to clipboard
  const copyPreview = async () => {
    try {
      await navigator.clipboard.writeText(renderPreview());
      // Could add a toast notification here
      toast.success("Preview copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // AI Generate template
  const handleAiGenerate = async () => {
    if (portfolioCategories.length === 0) {
      toast.error("Please add at least one category.");
      return;
    }

    if (!category) {
      toast.error("Please select a category");
      return;
    }

    const categoryForPrompt =
      portfolioCategories.find((c) => c.slug === category)?.name ||
      category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, " ");

    setAiGenerating(true);

    try {
      const res = await apiFetch("/api/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: categoryForPrompt,
          purpose: aiPurpose,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        code?: string;
        name?: string;
        content?: string;
        description?: string;
      };

      if (!res.ok) {
        // A missing or rejected key is a setup step, not a failure, so both
        // point at where to fix it rather than reading as a broken feature.
        if (
          data.code === "missing_api_key" ||
          data.code === "invalid_api_key"
        ) {
          toast.error(data.error || "Add your OpenAI API key in Settings.", {
            description: "Settings → AI Models",
          });
          return;
        }
        toast.error(data.error || "Failed to generate template");
        return;
      }


      if (data.name && !templateName) setTemplateName(data.name);
      if (data.content) setContent(data.content);
      if (data.description) setDescription(data.description);
      setAiPurpose("");
    } catch {
      toast.error("Failed to generate template. Please try again.");
    } finally {
      setAiGenerating(false);
    }
  };


  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-0 flex-1 flex-col -m-8 px-2">
        {/* Top Bar: sticky below dashboard nav (same scroll container as DashboardLayout) */}
        <header className="sticky top-16 z-20 flex min-h-16 shrink-0 flex-col md:flex-row  md:items-center md:justify-between border-b bg-card px-6 shadow-sm py-2 md:py-0">
          <div className="flex items-center gap-1 md:gap-4">
            <Link href="/templates">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h2 className="text-lg font-bold">Create Template</h2>
            <Button
              onClick={() => setGuideOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors cursor-pointer"
              title="Watch template writing guide"
            >
              <Info className="h-4 w-4" />
            </Button>
            {saveSuccess && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Check className="h-4 w-4" />
                Saved successfully!
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm shadow-primary/20 w-full md:w-fit"
              onClick={handleSave}
              disabled={saving || saveSuccess}
            >
              {saving ? (
                <>
                  <div className="h-4 w-4 mr-2 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Template
                </>
              )}
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:p-6 mt-4">
          <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-10 gap-6">
            {/* Left Panel (60%) */}
            <div className="lg:col-span-6 space-y-6">
              {/* Metadata Card */}
              <div className="bg-card rounded-xl shadow-sm border p-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-6">
                  Template Metadata
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">
                      Template Name
                    </label>
                    <Input
                      placeholder="e.g. Web Development Standard"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold">
                        Category <span className="text-destructive">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => void openManageCategories()}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Manage
                      </button>
                    </div>
                    {portfolioCategories.length === 0 ? (
                      <div className="rounded-lg border p-4 bg-muted/50">
                        <p className="text-sm text-muted-foreground mb-2">
                          No categories yet. Create one to get started.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCategoryDialog(true)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add New Category
                        </Button>
                      </div>
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

                  <div className="col-span-1 sm:col-span-2 space-y-1.5 pt-2">
                    <label className="text-sm font-semibold">
                      Description (Optional)
                    </label>
                    <Textarea
                      placeholder="Briefly describe what this template covers..."
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* AI Generate Card */}
              <div className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold">AI Template Generator</h3>
                    <p className="text-xs text-muted-foreground">
                      Generate a template with AI based on category and purpose.
                      Runs against your own OpenAI key.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <Input
                    placeholder="Describe the purpose (e.g. 'cold outreach for SaaS clients')"
                    value={aiPurpose}
                    onChange={(e) => setAiPurpose(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAiGenerate();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleAiGenerate}
                    disabled={aiGenerating}
                    className="shrink-0 gap-2 sm:self-start"
                  >
                    {aiGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {aiGenerating ? "Generating..." : "Generate with AI"}
                  </Button>
                </div>
              </div>

              {/* Editor Card */}
              <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
                {/* Editor Toolbar */}
                <div className="flex items-center gap-1 p-2 border-b bg-muted/50">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Variables:
                    </span>
                    <div className="flex gap-1 flex-wrap">
                      {variables.slice(0, 5).map((variable) => (
                        <button
                          key={variable}
                          onClick={() => insertVariable(variable)}
                          className="px-2 py-0.5 text-[11px] bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded text-primary font-mono"
                        >
                          {variable}
                        </button>
                      ))}
                      {variables.length > 5 && (
                        <span className="px-2 py-0.5 text-[11px] text-muted-foreground">
                          +{variables.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {wordCount} words
                  </div>
                </div>

                {/* Editor Area */}
                <div className="p-0 bg-background">
                  <Textarea
                    ref={contentRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-[500px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-sm p-8 resize-none"
                    placeholder="Start typing your template content here... Use {{variable_name}} to add variables."
                  />
                </div>
              </div>

              {/* Add Section Toolbar */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Available Sections
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {availableSections.map((section, index) => (
                    <button
                      key={index}
                      onClick={() => insertSection(section.template)}
                      className="flex items-center gap-3 p-4 bg-card border rounded-xl hover:border-primary/50 hover:shadow-md transition-all group text-left"
                    >
                      <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center text-2xl group-hover:bg-primary transition-all">
                        {section.icon}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{section.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {section.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Panel (40%) */}
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-0 space-y-4">
                {/* Preview Panel */}
                <div className="bg-card rounded-xl shadow-lg border flex flex-col h-[500px] lg:h-[calc(100vh-160px)]">
                  {/* Preview Header */}
                  <div className="p-4 border-b flex items-center justify-between shrink-0">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Eye className="h-4 w-4 text-primary" />
                      Live Preview
                    </h3>
                  </div>

                  {/* Preview Content */}
                  <div className="flex-1 overflow-y-auto p-6 bg-muted/20">
                    <div className="bg-background shadow-sm border p-8 min-h-full rounded-lg">
                      <div className="prose prose-sm max-w-none">
                        {renderPreview()
                          .split("\n")
                          .map((line, idx) => {
                            if (line.startsWith("## ")) {
                              return (
                                <h2
                                  key={idx}
                                  className="text-xl font-bold mt-6 mb-3"
                                >
                                  {line.replace("## ", "")}
                                </h2>
                              );
                            } else if (line.startsWith("# ")) {
                              return (
                                <h1
                                  key={idx}
                                  className="text-2xl font-bold mt-8 mb-4"
                                >
                                  {line.replace("# ", "")}
                                </h1>
                              );
                            } else if (line.trim() === "") {
                              return <div key={idx} className="h-4" />;
                            } else {
                              return (
                                <p
                                  key={idx}
                                  className="mb-3 leading-relaxed text-foreground"
                                >
                                  {line
                                    .split(/(\{\{[^}]+\}\})/g)
                                    .map((part, i) => {
                                      if (part.match(/\{\{[^}]+\}\}/)) {
                                        return (
                                          <span
                                            key={i}
                                            className="inline-flex items-center px-2 py-0.5 bg-primary/30 border border-primary/20 rounded-md font-mono text-[13px] mx-1 text-primary"
                                          >
                                            {part}
                                          </span>
                                        );
                                      }
                                      return <span key={i}>{part}</span>;
                                    })}
                                </p>
                              );
                            }
                          })}
                      </div>
                    </div>
                  </div>

                  {/* Preview Footer */}
                  <div className="p-4 bg-muted/50 border-t flex items-center justify-between rounded-b-xl shrink-0">
                    <div className="flex gap-4">
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-normaler">
                          Word Count
                        </p>
                        <p className="text-xs font-bold">{wordCount} Words</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-normaler">
                          Read Time
                        </p>
                        <p className="text-xs font-bold">
                          ~{readTime} Min{readTime !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-normaler">
                          Variables
                        </p>
                        <p className="text-xs font-bold">{variables.length}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={copyPreview}>
                      <Copy className="h-3 w-3 mr-2" />
                      Copy Preview
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
              disabled={savingCategory}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleAddCategory()}
              disabled={savingCategory}
            >
              {savingCategory ? "Creating..." : "Create Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base font-bold">
              How to write a great proposal template
            </DialogTitle>
          </DialogHeader>
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              src={GUIDE_VIDEO_URL}
              allow="autoplay; fullscreen"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
              title="Template writing guide"
            />
          </div>
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
                      <Badge variant="secondary" className="text-[11px] shrink-0">
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
    </TooltipProvider>
  );
}
