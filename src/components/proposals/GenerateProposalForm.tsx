"use client";

import { apiFetch } from "@/lib/api-fetch";
import {
  parseModelOptionValue,
  type ModelOption,
} from "@/lib/ai/model-options";
import {
  Sparkles,
  Save,
  FileText,
  DollarSign,
  X,
  Check,
  Copy,
  RefreshCw,
  Code,
  TrendingUp,
  Loader2,
  Trash2,
  FolderOpen,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
// import { useAuth } from "@/lib/auth/auth-context";
import { useAuthStore } from "@/lib/auth/auth-store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useShallow } from "zustand/react/shallow";
import type { Template, Project, ProposalInsert, Hook, Persona } from "@/types";
import { toast } from "sonner";
import { handleBoldKeyDown } from "@/lib/unicode-bold";
import {
  copyPlainText,
  copyRichText,
} from "@/lib/proposals/proposal-clipboard";
import { consumeJobPrefill } from "@/lib/prefill";
import {
  readHookGenerationStream,
  readProposalGenerationStream,
} from "@/lib/proposals/read-proposal-sse";
import { extractStreamingProposalParts } from "@/lib/proposals/parse-proposal-output";
import { ProposalStreamError } from "@/lib/proposals/read-proposal-sse";
import { MISSING_API_KEY_CODE } from "@/lib/ai/missing-api-key";
import {
  findSignupDefaultTemplateId,
  resolveTemplateIdForProposalGenerate,
} from "@/lib/proposals/signup-default-template";
import { cn } from "@/lib/utils";

const DEFAULT_PROPOSAL_HOOK = "Relatable Pain Point";

/**
 * Everything the server already knows by the time this renders.
 *
 * `hasOpenAiKey` and `modelOptions` used to be fetched here from
 * `/api/settings` in an effect, with `hasOpenAiKey` initialised to `false` — so
 * the "add your OpenAI key" banner and a dead model dropdown were asserted on
 * the very first paint, before anything had been checked, and then withdrawn a
 * round trip later for anyone who did have a key. Resolved on the server they
 * are simply right the first time.
 *
 * The search params arrive as props for the same reason: reading them with
 * `useSearchParams` forced a Suspense boundary, whose fallback was the spinner
 * that preceded the banner. What they trigger is still client work — a fetch,
 * or a sessionStorage read — only the reading of them moved.
 */
export type GenerateProposalFormProps = {
  hasOpenAiKey: boolean;
  modelOptions: ModelOption[];
  jobId: string | null;
  proposalId: string | null;
  prefillKey: string | null;
  template: string | null;
};

export function GenerateProposalForm({
  hasOpenAiKey,
  modelOptions,
  jobId,
  proposalId,
  prefillKey,
  template,
}: GenerateProposalFormProps) {
  const { user } = useAuthStore(
    useShallow((state) => ({
      user: state.user,
    })),
  );
  const [skills, setSkills] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [showOutput, setShowOutput] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [clientName, setClientName] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("intermediate");
  const [budget, setBudget] = useState("");
  /**
   * Whether `budget` is a project total or an hourly rate. Hourly jobs carry
   * their pay in `hourly_rate_*` rather than `budget_*`, so the figure means
   * something different and the label has to say which.
   */
  const [budgetKind, setBudgetKind] = useState<"fixed" | "hourly">("fixed");
  const [duration, setDuration] = useState("");
  const [templateId, setTemplateId] = useState("");
  /**
   * `"<provider>:<model>"` — the provider and the model in one value, so the
   * two can never disagree. It used to be a bare alias resolved through a
   * hardcoded map here, which is how this page drifted from Settings and ended
   * up offering models Settings did not.
   *
   * Empty until settings load, and empty for good when no provider has a key:
   * there is nothing to generate with, and the banner above says so.
   */
  const [aiModel, setAiModel] = useState(modelOptions[0]?.value ?? "");
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState("short");

  // Proposal personas (org or solo user-scoped identities for AI context)
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personasTotalCount, setPersonasTotalCount] = useState(0);
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [loadingPersonas, setLoadingPersonas] = useState(false);

  // Data from Supabase
  const [templates, setTemplates] = useState<Template[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // File states
  const [attachedFilesContent, setAttachedFilesContent] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  // Generated output
  const [generatedHook, setGeneratedHook] = useState("");
  const [generatedBody, setGeneratedBody] = useState("");
  const [generatedModel, setGeneratedModel] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [isStreamingOutput, setIsStreamingOutput] = useState(false);
  /** Raw accumulated model output while streaming (for incremental hook/body split). */
  const [streamRawBuffer, setStreamRawBuffer] = useState("");

  const streamingParts = useMemo(
    () => extractStreamingProposalParts(streamRawBuffer),
    [streamRawBuffer],
  );

  // Hook Regeneration
  const [hookType, setHookType] = useState(DEFAULT_PROPOSAL_HOOK);
  const [customHookInstruction, setCustomHookInstruction] = useState("");
  const [regeneratingHook, setRegeneratingHook] = useState(false);
  const [organizationHooks, setHooks] = useState<Hook[]>([]);
  const [hookSelectValue, setHookSelectValue] = useState(DEFAULT_PROPOSAL_HOOK);

  // Portfolio selection dialog
  const [portfolioDialogOpen, setPortfolioDialogOpen] = useState(false);
  const [pendingProjectIds, setPendingProjectIds] = useState<string[]>([]);
  const [selectedPortfolioCategory, setSelectedPortfolioCategory] = useState<
    string | null
  >(null);
  const [portfolioCategories, setPortfolioCategories] = useState<
    { id: string; name: string; slug: string; color: string | null }[]
  >([]);

  // Job analysis
  const [analyzingJob, setAnalyzingJob] = useState(false);
  const [jobAnalysis, setJobAnalysis] = useState<{
    skills?: string[];
    experience_level?: string;
    estimated_budget?: { min: number; max: number; type: string };
    estimated_duration_months?: number;
    key_requirements?: string[];
    red_flags?: string[];
    win_tips?: string[];
    client_priority?: string;
    complexity?: string;
    summary?: string;
    relevance_score?: number;
    matching_technologies?: string[];
    relevance_reasoning?: string;
  } | null>(null);

  // Pre-fill from secure sources (jobId, proposalId, or prefillKey)
  // Avoids passing sensitive job data in URL params - see security audit
  useEffect(() => {
    if (jobId) {
      apiFetch(`/api/jobs/${jobId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.job) {
            const j = data.job;
            setJobTitle(j.title || "");
            setJobDescription(j.description || "");
            setClientName(j.client_name || "");
            if (Array.isArray(j.skills) && j.skills.length) {
              setSkills(j.skills);
            }
            if (j.budget_max != null) setBudget(String(j.budget_max));
            if (j.experience_level) setExperienceLevel(j.experience_level);
          }
        })
        .catch(() => toast.error("Failed to load job"));
      return;
    }

    if (proposalId) {
      apiFetch(`/api/proposals/${proposalId}/prefill`)
        .then((r) => r.json())
        .then((data) => {
          if (data.prefill) {
            const p = data.prefill;
            setJobTitle(p.jobTitle || "");
            setJobDescription(p.jobDescription || "");
            setClientName(p.clientName || "");
            if (p.templateId) setTemplateId(p.templateId);
          }
        })
        .catch(() => toast.error("Failed to load proposal"));
      return;
    }

    if (prefillKey) {
      // Deferred to a microtask: `consumeJobPrefill` is synchronous, so calling
      // the setters inline would be a synchronous setState inside the effect.
      void Promise.resolve().then(() => {
        const data = consumeJobPrefill(prefillKey);
        if (!data) return;
        setJobTitle(data.jobTitle || "");
        setJobDescription(data.jobDescription || "");
        if (data.skills?.length) setSkills(data.skills);
        if (data.budget) setBudget(data.budget);
        if (data.budgetKind) setBudgetKind(data.budgetKind);
        if (data.experienceLevel) setExperienceLevel(data.experienceLevel);
      });
    }
  }, [jobId, proposalId, prefillKey]);

  /**
   * Pre-select the template: the `?template=` param wins, otherwise the signup
   * starter once the list has loaded.
   *
   * Both are pure derivations, done during render on the transition rather than
   * in effects: a synchronous setState in an effect body is the cascading
   * render `react-hooks/set-state-in-effect` flags.
   */
  const templateParam = template;
  const [templateSyncKey, setTemplateSyncKey] = useState<string | null>(null);
  const nextTemplateSyncKey = `${templateParam ?? ""}|${templates.length}`;
  if (templateSyncKey !== nextTemplateSyncKey) {
    setTemplateSyncKey(nextTemplateSyncKey);
    if (templateParam) {
      setTemplateId(templateParam);
    } else if (templates.length) {
      setTemplateId((prev) =>
        prev !== "" ? prev : (findSignupDefaultTemplateId(templates) ?? ""),
      );
    }
  }

  // Clear a selection whose persona no longer exists. A pure derivation of
  // `personas`, so it happens during render rather than in an effect.
  if (
    selectedPersonaId &&
    personas.length > 0 &&
    !personas.some((pp) => pp.id === selectedPersonaId)
  ) {
    setSelectedPersonaId("");
  }

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from("templates")
      .select("*")
      .order("is_default", { ascending: false });
    if (data) setTemplates(data);
  };

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("is_featured", { ascending: false });
    if (data) setProjects(data);
  };

  useEffect(() => {
    const fetchPersonas = async () => {
      try {
        setLoadingPersonas(true);
        const res = await apiFetch("/api/personas?forProposalSelector=true");
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load personas");
        }

        setPersonas(data.personas || []);
        setPersonasTotalCount(
          typeof data.totalPersonaCount === "number"
            ? data.totalPersonaCount
            : (data.personas || []).length,
        );
      } catch (err) {
        console.error(err);
        toast.error("Unable to load personas");
      } finally {
        setLoadingPersonas(false);
      }
    };

    if (!user) return;

    void (async () => {
      await Promise.all([fetchTemplates(), fetchProjects(), fetchPersonas()]);
    })();
    apiFetch("/api/hooks")
      .then((r) => r.json())
      .then((data) => setHooks(data.hooks || []))
      .catch(() => setHooks([]));
    // `fetchTemplates` / `fetchProjects` close over setters only, so leaving
    // them out of the deps cannot go stale.
  }, [user]);

  useEffect(() => {
    apiFetch("/api/settings/portfolio-categories")
      .then((r) => r.json())
      .then((data) => setPortfolioCategories(data.categories || []))
      .catch(() => {});
  }, []);

  // Categories for filter: use org categories, or derive from projects if none
  const portfolioCategorySlugs =
    portfolioCategories.length > 0
      ? portfolioCategories.map((c) => c.slug)
      : (Array.from(
          new Set(projects.map((p) => p.category).filter(Boolean)),
        ) as string[]);
  const getPortfolioCategoryLabel = (slug: string) =>
    portfolioCategories.find((c) => c.slug === slug)?.name ||
    slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");

  const filteredPortfolioProjects = selectedPortfolioCategory
    ? projects.filter((p) => p.category === selectedPortfolioCategory)
    : projects;

  const personaGenerateBlocked = useMemo(() => {
    if (loadingPersonas) return true;
    if (personas.length === 0) return true;
    return !selectedPersonaId;
  }, [loadingPersonas, personas.length, selectedPersonaId]);

  const personaGenerateDisabledHint = useMemo(() => {
    if (loadingPersonas) {
      return "Loading personas…";
    }
    if (personas.length === 0) {
      return personasTotalCount > 0
        ? "No persona reaches 70% completion. On the Personas page."
        : "Create a proposal persona first on the Personas page.";
    }
    if (!selectedPersonaId) {
      return "Select a proposal persona in the dropdown above.";
    }
    return undefined;
  }, [loadingPersonas, personas.length, personasTotalCount, selectedPersonaId]);

  /**
   * Reports a failure using what the server actually said.
   *
   * The streaming paths return HTTP 200 and then report failure inside the
   * event stream, so `readSseStream` throws and the catch block is the only
   * place that message exists. Replacing it with "Something went wrong" is what
   * made a missing API key look like a broken app.
   */
  const reportAiError = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback;
    const code =
      error instanceof ProposalStreamError ? error.code : undefined;

    if (code === MISSING_API_KEY_CODE) {
      toast.error(message, { description: "Settings → AI Models" });
      return;
    }
    toast.error(message || fallback);
  };

  const handleAnalyzeJob = async () => {
    if (!jobDescription) {
      toast.error("Please enter a job description first");
      return;
    }

    setAnalyzingJob(true);

    try {
      const res = await apiFetch("/api/proposals/analyze-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle, jobDescription }),
      });

      const data = await res.json();
      console.log("data from the analyze job", data);
      if (!res.ok) {
        if (data.code === MISSING_API_KEY_CODE) {
          toast.error(data.error || "Add your OpenAI API key in Settings.", {
            description: "Settings → AI Models",
          });
          return;
        }
        toast.error(data.error || "Failed to analyze job");
        return;
      }

      setJobAnalysis(data);

      // Auto-fill fields from analysis
      if (data.skills?.length && skills.length === 0) {
        setSkills(data.skills.map((s: string) => s.toUpperCase()));
      }
      if (data.experience_level) {
        setExperienceLevel(data.experience_level);
      }
      if (data.estimated_budget?.max) {
        setBudget(String(data.estimated_budget.max));
      }
      if (data.estimated_duration_months) {
        setDuration(String(data.estimated_duration_months));
      }
    } catch {
      toast.error("Failed to analyze job. Please try again.");
    } finally {
      setAnalyzingJob(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsParsing(true);

    try {
      const newContents: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);

        const res = await apiFetch("/api/utils/parse-file", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (res.ok && data.text) {
          newContents.push(`--- FILE: ${file.name} ---\n${data.text}\n`);
        } else {
          toast.error(`Failed to parse ${file.name}: ${data.error}`);
        }
      }

      if (newContents.length > 0) {
        setAttachedFilesContent((prev) => prev + "\n" + newContents.join("\n"));
        toast.success("Files processed successfully!");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload/parse files");
    } finally {
      setIsParsing(false);
      // Reset input
      e.target.value = "";
    }
  };

  /**
   * Splits the selected `"<provider>:<model>"` back into its two halves.
   *
   * This replaced a lookup table that mapped UI aliases to provider/model
   * pairs. The table was the drift: it hardcoded a fourth copy of the model
   * list, offered `gpt-5-nano` that Settings never did, and carried a `"claude"`
   * alias that was not a real model id. Encoding both halves in the value
   * itself means there is nothing left to keep in sync.
   */
  const getProviderAndModel = () => parseModelOptionValue(aiModel);

  const handleGenerate = async () => {
    if (!jobTitle || !jobDescription) {
      toast.error("Job title and description are required");
      return;
    }
    if (!aiModel) {
      toast.error("No AI provider is configured.", {
        description: "Settings → AI Models",
      });
      return;
    }
    if (loadingPersonas) {
      toast.error("Still loading personas. Wait a moment and try again.");
      return;
    }
    if (personas.length === 0) {
      toast.error(
        personasTotalCount > 0
          ? "No persona reaches 70% completion yet. Finish one on the Personas page."
          : "Create a proposal persona first on the Personas page.",
      );
      return;
    }
    if (!selectedPersonaId) {
      toast.error("Select a proposal persona before generating.");
      return;
    }

    setGenerating(true);
    setShowOutput(true);
    setIsStreamingOutput(true);
    setStreamRawBuffer("");
    setGeneratedHook("");
    setGeneratedBody("");

    // Resolve customHookInstruction from current selection if it's a My Hook
    let resolvedCustomInstruction = customHookInstruction;
    if (hookSelectValue.startsWith("hook:")) {
      const id = hookSelectValue.replace("hook:", "");
      const hook = organizationHooks.find((h) => h.id === id);
      resolvedCustomInstruction = hook?.description ?? "";
    }
    const effectiveHookType =
      (hookType === "Custom" && resolvedCustomInstruction) ||
      hookSelectValue.startsWith("hook:")
        ? "Custom"
        : hookType;
    const effectiveCustomInstruction =
      effectiveHookType === "Custom" ? resolvedCustomInstruction : undefined;

    try {
      const selection = getProviderAndModel();
      if (!selection) {
        toast.error("No AI provider is configured.", {
          description: "Settings → AI Models",
        });
        return;
      }
      const { provider, model } = selection;

      const res = await apiFetch("/api/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle,
          jobDescription,
          clientName,
          experienceLevel,
          budget: budget ? parseFloat(budget) : undefined,
          duration: duration ? parseInt(duration) : undefined,
          skills,
          templateId: resolveTemplateIdForProposalGenerate(
            templateId,
            templates,
          ),
          selectedProjectIds,
          aiProvider: provider,
          aiModel: model,
          tone,
          length,
          personaId: selectedPersonaId || undefined,
          attachedFilesContent: attachedFilesContent || undefined,
          hookType: effectiveHookType,
          customHookInstruction: effectiveCustomInstruction,
          stream: true,
        }),
      });

      const contentType = res.headers.get("content-type") || "";

      if (!res.ok) {
        setIsStreamingOutput(false);
        setStreamRawBuffer("");
        setShowOutput(false);
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        if (data.code === MISSING_API_KEY_CODE) {
          toast.error(data.error || "Add your API key in Settings.", {
            description: "Settings → AI Models",
          });
          return;
        }
        toast.error(data.error || "Failed to generate proposal");
        return;
      }

      if (contentType.includes("text/event-stream")) {
        const done = await readProposalGenerationStream(res, (delta) => {
          setStreamRawBuffer((prev) => prev + delta);
        });
        setGeneratedHook(done.hook || "");
        setGeneratedBody(done.body || done.content || "");
        setGeneratedModel(done.model ?? "");
        setWordCount(done.wordCount ?? 0);
        setStreamRawBuffer("");
        setIsStreamingOutput(false);
        setShowOutput(true);
        return;
      }

      const data = (await res.json()) as {
        error?: string;
        balance?: number;
        hook?: string;
        body?: string;
        content?: string;
        model?: string;
        wordCount?: number;
      };

      setGeneratedHook(data.hook || "");
      setGeneratedBody(data.body || data.content || "");
      setGeneratedModel(data.model ?? "");
      setWordCount(data.wordCount ?? 0);
      setIsStreamingOutput(false);
      setShowOutput(true);
    } catch (err) {
      reportAiError(err, "Failed to generate proposal");
      setIsStreamingOutput(false);
      setStreamRawBuffer("");
      setShowOutput(false);
    } finally {
      setGenerating(false);
    }
  };

  const handleHookSelect = (value: string) => {
    setHookSelectValue(value);
    if (value.startsWith("hook:")) {
      const id = value.replace("hook:", "");
      const hook = organizationHooks.find((h) => h.id === id);
      if (hook) {
        setHookType("Custom");
        setCustomHookInstruction(hook.description);
      } else {
        setHookType(DEFAULT_PROPOSAL_HOOK);
        setCustomHookInstruction("");
        setHookSelectValue(DEFAULT_PROPOSAL_HOOK);
      }
    } else if (value === "Custom") {
      setHookType("Custom");
      setCustomHookInstruction("");
    } else {
      setHookType(value);
      setCustomHookInstruction("");
    }
  };

  const handleRegenerateHook = async () => {
    if (!jobTitle || !jobDescription) return;
    const previousHook = generatedHook;
    setRegeneratingHook(true);
    setGeneratedHook("");

    // Resolve customHookInstruction from current selection if it's a My Hook (avoids stale closure)
    let resolvedCustomInstruction = customHookInstruction;
    if (hookSelectValue.startsWith("hook:")) {
      const id = hookSelectValue.replace("hook:", "");
      const hook = organizationHooks.find((h) => h.id === id);
      resolvedCustomInstruction = hook?.description ?? "";
    }

    const shouldSendCustom =
      (hookType === "Custom" && resolvedCustomInstruction) ||
      hookSelectValue.startsWith("hook:");

    try {
      const selection = getProviderAndModel();
      if (!selection) {
        toast.error("No AI provider is configured.", {
          description: "Settings → AI Models",
        });
        return;
      }
      const { provider, model } = selection;

      const res = await apiFetch("/api/proposals/generate-hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle,
          jobDescription,
          clientName,
          hookType: shouldSendCustom ? "Custom" : hookType,
          customHookInstruction: shouldSendCustom
            ? resolvedCustomInstruction
            : undefined,
          aiProvider: provider,
          aiModel: model,
          tone,
          stream: true,
        }),
      });

      const contentType = res.headers.get("content-type") || "";

      if (!res.ok) {
        setGeneratedHook(previousHook);
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          balance?: number;
          code?: string;
        };
        toast.error(data.error || "Failed to regenerate hook");
        return;
      }

      if (contentType.includes("text/event-stream")) {
        const done = await readHookGenerationStream(res, (delta) => {
          setGeneratedHook((prev) => prev + delta);
        });
        setGeneratedHook(done.hook || "");
        if (done.model) setGeneratedModel(done.model);
        return;
      }

      const data = (await res.json()) as {
        hook?: string;
        model?: string;
      };
      setGeneratedHook(data.hook || "");
      if (data.model) setGeneratedModel(data.model);
    } catch (err) {
      setGeneratedHook(previousHook);
      reportAiError(err, "Failed to regenerate the hook");
    } finally {
      setRegeneratingHook(false);
    }
  };

  const handleSave = async () => {
    const fullContent = (generatedHook + "\n\n" + generatedBody).trim();
    if (!fullContent) return;

    setSaving(true);
    try {
      // Only a record of what produced the text; a selection that no longer
      // parses is stored as null rather than guessing a provider.
      const selection = getProviderAndModel();

      const payload: ProposalInsert = {
        client_name: clientName || "Unknown Client",
        job_title: jobTitle,
        job_description: jobDescription,
        proposal_content: fullContent,
        selected_projects: selectedProjectIds,
        template_id: !templateId || templateId === "none" ? null : templateId,
        status: "draft",
        user_id: user!.id,
        ai_model: generatedModel,
        ai_provider: selection?.provider ?? null,
        persona_id: selectedPersonaId || null,
      };

      // postgrest-js canary sometimes infers `.insert` as `never`; runtime shape matches ProposalInsert.
      const { error: saveError } = await supabase
        .from("proposals")
        .insert(payload as unknown as never);

      if (saveError) {
        toast.error("Failed to save proposal");
      } else {
        toast.success("Proposal saved as draft!");
      }
    } catch {
      toast.error("Failed to save proposal");
    } finally {
      setSaving(false);
    }
  };

  /** The proposal as the user currently sees it, mid-stream or finished. */
  const currentProposalText = () =>
    isStreamingOutput
      ? `${streamingParts.hook}\n\n${streamingParts.body}`.trim()
      : (generatedHook + "\n\n" + generatedBody).trim();

  // Both copy buttons used to call one function that wrote plain text, so
  // "Copy Rich Text" produced exactly what "Copy Text" did. They differ now,
  // and each says whether it worked — a silent clipboard write leaves the user
  // guessing whether the click registered.
  const handleCopyText = async () => {
    const ok = await copyPlainText(currentProposalText());
    if (ok) toast.success("Proposal copied to clipboard!");
    else toast.error("Couldn't copy to clipboard");
  };

  const handleCopyRichText = async () => {
    const ok = await copyRichText(currentProposalText());
    if (ok) toast.success("Proposal copied with formatting!");
    else toast.error("Couldn't copy to clipboard");
  };

  const fullContentToCount = isStreamingOutput
    ? `${streamingParts.hook}\n\n${streamingParts.body}`.trim()
    : (generatedHook + "\n\n" + generatedBody).trim();
  const currentWordCount = fullContentToCount
    ? fullContentToCount.split(/\s+/).filter(Boolean).length
    : wordCount;
  const readTime = Math.max(1, Math.ceil(currentWordCount / 200));

  const fieldLabelClass =
    "mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
  const leftFieldLabelClass =
    "mb-1.5 block text-sm font-medium uppercase tracking-wide text-muted-foreground";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto -mt-6 max-w-5xl px-4 py-8 pb-16 sm:px-6 lg:py-10">
        {!hasOpenAiKey && (
          <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-semibold text-amber-900 dark:text-amber-100">
                Add your OpenAI API key to generate proposal
              </p>
            </div>
            {/* Brand lime with the near-black foreground on top, the same
                pairing the other primary CTAs use. The default Button variant
                is already `bg-primary text-primary-foreground`. */}
            <Button asChild className="w-full shrink-0 sm:w-auto">
              <Link href="/settings?tab=ai-models">Open Settings</Link>
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_min(100%,23rem)] lg:items-start lg:gap-x-5 xl:gap-x-6">
          {/* Section 1: Job Details */}
          <section className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-border/60 lg:col-start-1 lg:row-start-1">
            <div className="flex items-start justify-between gap-4 border-b bg-muted/30 px-6 py-4 sm:px-7">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-normal">
                  Job details
                </h2>
                <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
                  Paste the post and optional client context. The model uses
                  this verbatim.
                </p>
              </div>
              <span className="shrink-0 rounded-md border bg-white px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Required
              </span>
            </div>
            <div className="space-y-6 p-6 sm:p-7">
              <div className="space-y-2">
                <label className={leftFieldLabelClass}>Job Title *</label>
                <Input
                  placeholder="e.g. Senior React Developer for Fintech Startup"
                  className="rounded-lg border-border/80 bg-white h-11"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className={leftFieldLabelClass}>Job Description *</label>
                <Textarea
                  placeholder="Paste the full job description here..."
                  rows={5}
                  className="field-sizing-fixed max-h-[min(45vh,320px)] min-h-[120px] overflow-y-auto rounded-lg border-border/80 bg-white"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={leftFieldLabelClass}>
                    Job Attachments (PDF, DOCX)
                  </label>
                  {isParsing && (
                    <span className="flex items-center gap-1 text-[10px] text-primary font-bold">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      PARSING...
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type="file"
                      multiple
                      accept=".pdf,.docx,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="file-upload"
                      disabled={isParsing}
                    />
                    <label
                      htmlFor="file-upload"
                      className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-3 transition-colors hover:border-border hover:bg-muted/40 ${isParsing ? "pointer-events-none opacity-50" : ""}`}
                    >
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground font-medium">
                        Upload job files to include in analysis
                      </span>
                    </label>
                  </div>
                  {attachedFilesContent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAttachedFilesContent("")}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      Clear All
                    </Button>
                  )}
                </div>
                {attachedFilesContent && (
                  <div className="mt-2 text-[11px] text-muted-foreground bg-muted/30 p-3 rounded-lg border border-dashed border-muted-foreground/30 max-h-[150px] overflow-y-auto">
                    <p className="font-bold uppercase tracking-widest text-[9px] mb-2">
                      Extracted Content for AI:
                    </p>
                    <div className="whitespace-pre-wrap font-mono">
                      {attachedFilesContent}
                    </div>
                  </div>
                )}

                <div className=" pt-4">
                  <Button
                    type="button"
                    onClick={handleAnalyzeJob}
                    disabled={analyzingJob || !jobDescription}
                    variant="secondary"
                    className="h-auto shrink-0 cursor-pointer gap-2 rounded-lg border border-accent/35 bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition-[box-shadow,transform] hover:bg-accent/90 hover:shadow-md active:scale-[0.99]"
                  >
                    {analyzingJob ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TrendingUp className="h-4 w-4" />
                    )}
                    {analyzingJob ? "Analyzing..." : "Analyze Job"}
                  </Button>
                </div>

                {/* Job Analysis Results */}
                {jobAnalysis && (
                  <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> AI Job Analysis
                      </h4>
                      <button
                        onClick={() => setJobAnalysis(null)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>

                    {jobAnalysis.summary && (
                      <p className="text-sm text-muted-foreground">
                        {jobAnalysis.summary}
                      </p>
                    )}

                    {typeof jobAnalysis.relevance_score === "number" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded ${
                              jobAnalysis.relevance_score >= 60
                                ? "bg-green-500/20 text-green-700 dark:text-green-400"
                                : jobAnalysis.relevance_score >= 40
                                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                                  : "bg-red-500/20 text-red-700 dark:text-red-400"
                            }`}
                          >
                            {jobAnalysis.relevance_score}%
                          </span>
                          {jobAnalysis.matching_technologies &&
                            jobAnalysis.matching_technologies.length > 0 &&
                            jobAnalysis.matching_technologies.map((tech, i) => (
                              <span
                                key={i}
                                className="text-[12px] rounded-md bg-muted px-1.5 py-0.5 font-medium"
                              >
                                {tech}
                              </span>
                            ))}
                        </div>
                        {jobAnalysis.relevance_reasoning && (
                          <p className="text-xs text-muted-foreground">
                            {jobAnalysis.relevance_reasoning}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="bg-white rounded-lg p-2 text-center">
                        <p className="text-muted-foreground">Complexity</p>
                        <p className="font-bold capitalize">
                          {jobAnalysis.complexity}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-2 text-center">
                        <p className="text-muted-foreground">Priority</p>
                        <p className="font-bold capitalize">
                          {jobAnalysis.client_priority}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-2 text-center">
                        <p className="text-muted-foreground">Budget Est.</p>
                        <p className="font-bold">
                          {jobAnalysis.estimated_budget
                            ? `$${jobAnalysis.estimated_budget.min}-${jobAnalysis.estimated_budget.max}`
                            : "N/A"}
                        </p>
                      </div>
                    </div>

                    {jobAnalysis.key_requirements &&
                      jobAnalysis.key_requirements.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">
                            Key Requirements
                          </p>
                          <ul className="text-xs space-y-1">
                            {jobAnalysis.key_requirements.map((req, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <Check className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                                {req}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                    {jobAnalysis.win_tips &&
                      jobAnalysis.win_tips.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">
                            Win Tips
                          </p>
                          <ul className="text-xs space-y-1">
                            {jobAnalysis.win_tips.map((tip, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                                {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                    {jobAnalysis.red_flags &&
                      jobAnalysis.red_flags.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-destructive uppercase mb-1">
                            Red Flags
                          </p>
                          <ul className="text-xs space-y-1">
                            {jobAnalysis.red_flags.map((flag, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-1 text-destructive"
                              >
                                <span className="shrink-0">!</span>
                                {flag}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5">
                <div className="space-y-2">
                  <label className={leftFieldLabelClass}>Client Name</label>
                  <Input
                    placeholder="e.g. Acme Corp"
                    className="rounded-lg border-border/80 bg-white h-11"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className={leftFieldLabelClass}>
                    Experience Level
                  </label>
                  <Select
                    value={experienceLevel}
                    onValueChange={setExperienceLevel}
                  >
                    <SelectTrigger className="rounded-lg border-border/80 bg-white w-full h-11!">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entry">Entry</SelectItem>
                      <SelectItem value="intermediate">Intermediate</SelectItem>
                      <SelectItem value="expert">Expert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className={leftFieldLabelClass}>
                    Proposal persona
                  </label>
                  <Select
                    value={selectedPersonaId}
                    onValueChange={setSelectedPersonaId}
                    disabled={loadingPersonas || personas.length === 0}
                  >
                    <SelectTrigger className="rounded-lg border-border/80 bg-white w-full h-11!">
                      <SelectValue
                        placeholder={
                          loadingPersonas
                            ? "Loading personas..."
                            : personas.length === 0 && personasTotalCount > 0
                              ? "No persona reaches 70% completion. Edit on the Personas page"
                              : personas.length === 0
                                ? "No personas yet. Add one on the Personas page"
                                : "Select a persona"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {personas.map((persona) => {
                        const displayName =
                          persona.full_name?.trim() || "Unnamed persona";

                        return (
                          <SelectItem key={persona.id} value={persona.id}>
                            {displayName}
                            {persona.role_title
                              ? ` (${persona.role_title})`
                              : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5">
                <div className="space-y-2">
                  <label className={leftFieldLabelClass}>
                    {budgetKind === "hourly" ? "Rate ($/hr)" : "Budget ($)"}
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="rounded-lg border-border/80 bg-card pl-9 h-11"
                      placeholder={budgetKind === "hourly" ? "45" : "5,000"}
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className={leftFieldLabelClass}>
                    Duration (Months)
                  </label>
                  <Input
                    className="rounded-lg border-border/80 bg-white h-11"
                    placeholder="3"
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </div>
              </div>

              {/* <div className="space-y-2">
            <label className={fieldLabelClass}>
              Required Skills
            </label>
            <div className="flex flex-wrap gap-2 p-2 min-h-[42px] border rounded-lg bg-muted/50">
              {skills.map((skill, index) => (
                <span
                  key={index}
                  className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1"
                >
                  {skill}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() =>
                      setSkills(skills.filter((_, i) => i !== index))
                    }
                  />
                </span>
              ))}
              <input
                className="text-xs text-muted-foreground flex-1 min-w-[100px] bg-transparent border-none outline-none px-2"
                placeholder="Type skill and press Enter..."
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
              />
            </div>
          </div> */}
            </div>
          </section>

          <aside className="min-w-0 space-y-5 ">
            <section className="overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-border/60">
              <div className="border-b bg-muted/30 px-6 py-4">
                <h2 className="text-lg font-semibold tracking-normal">
                  Proposal settings
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Template, tone, portfolio, and model. You can adjust anytime
                  before you generate.
                </p>
              </div>
              <div className="space-y-5 p-6">
                <div className="space-y-2">
                  <div className="flex items-end justify-between gap-3">
                    <label className={fieldLabelClass}>Select Template</label>
                    {templates.length > 0 && (
                      <span className="mb-1 rounded-md bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
                        Recommended
                      </span>
                    )}
                  </div>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger className="w-full rounded-lg border-border/80 bg-white h-11!">
                      <SelectValue placeholder="Choose a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No template</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} {t.is_default ? "(Default)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className={fieldLabelClass}>Portfolio Projects</label>
                  <div className="space-y-2">
                    {selectedProjectIds.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedProjectIds.map((id) => {
                          const project = projects.find((p) => p.id === id);
                          return project ? (
                            <div
                              key={project.id}
                              className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm"
                            >
                              <span className="font-medium truncate max-w-[180px]">
                                {project.name}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedProjectIds(
                                    selectedProjectIds.filter(
                                      (p) => p !== project.id,
                                    ),
                                  )
                                }
                                className="text-muted-foreground hover:text-destructive shrink-0"
                                aria-label="Remove"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : null;
                        })}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-2.5 text-sm text-muted-foreground">
                        No portfolio projects selected.
                      </p>
                    )}
                    <Dialog
                      open={portfolioDialogOpen}
                      onOpenChange={(open) => {
                        setPortfolioDialogOpen(open);
                        if (open) {
                          setPendingProjectIds([...selectedProjectIds]);
                          setSelectedPortfolioCategory(null);
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2 rounded-lg py-2.5 h-auto"
                        >
                          <FolderOpen className="h-4 w-4" />
                          Browse projects
                        </Button>
                      </DialogTrigger>
                      <DialogContent
                        className="sm:max-w-4xl! w-[60vw]!important max-h-[85vh] flex flex-col gap-0 p-0"
                        showCloseButton={true}
                      >
                        <DialogHeader className="p-6 pb-4">
                          <DialogTitle>Select portfolio items</DialogTitle>
                        </DialogHeader>
                        <div className="px-6 pb-3 flex flex-wrap gap-2">
                          <Button
                            variant={
                              selectedPortfolioCategory === null
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            onClick={() => setSelectedPortfolioCategory(null)}
                          >
                            All
                          </Button>
                          {portfolioCategorySlugs.map((slug) => (
                            <Button
                              key={slug}
                              variant={
                                selectedPortfolioCategory === slug
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              onClick={() => setSelectedPortfolioCategory(slug)}
                            >
                              {getPortfolioCategoryLabel(slug)}
                            </Button>
                          ))}
                        </div>
                        <div className="flex flex-col border-y md:flex-row px-3 pb-6 min-h-0 overflow-hidden">
                          {/* Left: All portfolios */}
                          <div className=" flex flex-col min-h-0 w-full md:w-[70%] overflow-hidden">
                            <div className="px-4 py-3  bg-muted/30">
                              <h4 className="text-sm font-semibold">
                                Portfolio ({filteredPortfolioProjects.length})
                              </h4>
                            </div>
                            <div className=" overflow-y-auto p-3 space-y-3">
                              {filteredPortfolioProjects.map((project) => {
                                const isSelected = pendingProjectIds.includes(
                                  project.id,
                                );
                                return (
                                  <div
                                    key={project.id}
                                    className="rounded-lg  bg-card p-4 space-y-2"
                                  >
                                    <p className="font-medium text-sm">
                                      {project.name}
                                    </p>
                                    {project.description && (
                                      <p className="text-xs text-muted-foreground line-clamp-2">
                                        {project.description}
                                      </p>
                                    )}
                                    {project.technologies &&
                                      project.technologies.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {project.technologies.map((t) => (
                                            <span
                                              key={t}
                                              className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium"
                                            >
                                              {t}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={
                                        isSelected ? "secondary" : "outline"
                                      }
                                      className="w-full md:w-[250px] mt-2 cursor-pointer"
                                      onClick={() => {
                                        setPendingProjectIds((prev) =>
                                          isSelected
                                            ? prev.filter(
                                                (id) => id !== project.id,
                                              )
                                            : [...prev, project.id],
                                        );
                                      }}
                                    >
                                      {isSelected ? (
                                        <>
                                          <Check className="h-4 w-4 mr-1" />
                                          Selected
                                        </>
                                      ) : (
                                        "Select"
                                      )}
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {/* Right: Selected (Highlights) */}
                          <div className="flex flex-col min-h-0 w-[30%]  overflow-hidden">
                            <div className="pl-4  py-3  bg-muted/30">
                              <h4 className="text-sm font-semibold">
                                Selected ({pendingProjectIds.length})
                              </h4>
                            </div>
                            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                              {pendingProjectIds.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4 text-center">
                                  Select projects from the left to add them
                                  here.
                                </p>
                              ) : (
                                pendingProjectIds.map((id, index) => {
                                  const project = projects.find(
                                    (p) => p.id === id,
                                  );
                                  return project ? (
                                    <div
                                      key={project.id}
                                      className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm"
                                    >
                                      <span className="text-muted-foreground font-medium shrink-0">
                                        {index + 1}.
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">
                                          {project.name}
                                        </p>
                                        {project.technologies &&
                                          project.technologies.length > 0 && (
                                            <p className="text-[10px] text-muted-foreground truncate">
                                              {project.technologies
                                                .slice(0, 3)
                                                .join(", ")}
                                              {project.technologies.length > 3
                                                ? " + more"
                                                : ""}
                                            </p>
                                          )}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPendingProjectIds((prev) =>
                                            prev.filter(
                                              (pid) => pid !== project.id,
                                            ),
                                          )
                                        }
                                        className="text-muted-foreground hover:text-destructive shrink-0 p-1 cursor-pointer"
                                        aria-label="Remove"
                                      >
                                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                                      </button>
                                    </div>
                                  ) : null;
                                })
                              )}
                            </div>
                          </div>
                        </div>
                        <DialogFooter className="p-6 pt-4 border-t flex-row gap-2 justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPortfolioDialogOpen(false)}
                            className="cursor-pointer hover:bg-transparent"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            onClick={() => {
                              setSelectedProjectIds([...pendingProjectIds]);
                              setPortfolioDialogOpen(false);
                            }}
                            className="cursor-pointer"
                          >
                            Add Selected Projects
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <label className={fieldLabelClass}>AI Model</label>
                    {/*
                      Upstream split this into a "Platform" group gated by plan
                      and an "OpenAI Key" group shown only to BYOK users, with
                      items disabled when the credit balance could not afford
                      them. Every model here runs on the user's own key, so
                      nothing is gated — but nothing is hardcoded either: the
                      options are the models configured in Settings, one per
                      provider that has a key. Choosing a model happens there,
                      so this page can never offer one Settings does not.
                    */}
                    <Select
                      value={aiModel}
                      onValueChange={setAiModel}
                      disabled={modelOptions.length === 0}
                    >
                      <SelectTrigger className="h-11! w-full rounded-lg border-border/80 bg-white">
                        <SelectValue placeholder="No AI provider configured" />
                      </SelectTrigger>
                      <SelectContent>
                        {modelOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className={fieldLabelClass}>Tone</label>
                    <Select value={tone} onValueChange={setTone}>
                      <SelectTrigger className="h-11! w-full rounded-lg border-border/80 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">
                          Professional
                        </SelectItem>
                        <SelectItem value="conversational">
                          Conversational
                        </SelectItem>
                        <SelectItem value="technical">
                          Highly Technical
                        </SelectItem>
                        <SelectItem value="persuasive">Persuasive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className={fieldLabelClass}>Length</label>
                    <Select value={length} onValueChange={setLength}>
                      <SelectTrigger className="h-11! w-full rounded-lg border-border/80 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">Short</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="long">Long</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className={fieldLabelClass}>Hook</label>
                    <Select
                      value={hookSelectValue}
                      onValueChange={handleHookSelect}
                    >
                      <SelectTrigger className="h-11! w-full rounded-lg border-border/80 bg-white">
                        <SelectValue placeholder="Select Hook Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Built-in Hooks</SelectLabel>
                          <SelectItem value="Relatable Pain Point">
                            Relatable Pain Point
                          </SelectItem>
                          <SelectItem value="Callout + Quick Win">
                            Callout + Quick Win
                          </SelectItem>
                          <SelectItem value="Mini Case Study">
                            Mini Case Study
                          </SelectItem>
                          <SelectItem value="Custom">
                            Custom (manual)
                          </SelectItem>
                        </SelectGroup>
                        {organizationHooks.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>My Hooks</SelectLabel>
                            {organizationHooks.map((h) => (
                              <SelectItem key={h.id} value={`hook:${h.id}`}>
                                {h.title}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {hookType === "Custom" && hookSelectValue === "Custom" && (
                  <div className="space-y-2 border-t border-border/60 pt-5">
                    <label className={fieldLabelClass}>
                      Custom Hook Instructions
                    </label>
                    <Input
                      placeholder="Enter custom hook instructions (e.g. 'Start with a joke about missing semicolons')"
                      value={customHookInstruction}
                      onChange={(e) => setCustomHookInstruction(e.target.value)}
                      className="rounded-lg border-border/80 bg-white text-sm h-11"
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Primary Action Button */}
            <Button
              onClick={handleGenerate}
              disabled={generating || personaGenerateBlocked}
              title={personaGenerateDisabledHint}
              className="w-full cursor-pointer rounded-2xl border border-accent/25 bg-accent py-5 text-[15px] font-semibold tracking-normal text-accent-foreground shadow-lg transition-[box-shadow,transform] hover:bg-accent/92 hover:shadow-xl active:scale-[0.995] sm:py-6"
            >
              {generating ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  GENERATING...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2" />
                  GENERATE PROPOSAL
                </>
              )}
            </Button>
          </aside>

          {/* Section 3: Generated Output */}
          {showOutput &&
            (isStreamingOutput ||
              generatedHook ||
              generatedBody ||
              streamRawBuffer) && (
              <section className="min-w-0 overflow-hidden rounded-2xl border border-primary/25 bg-card shadow-lg ring-1 ring-primary/10 lg:col-span-2 lg:col-start-1 lg:row-start-2">
                <div className="flex items-center justify-between gap-4 border-b border-primary/15 bg-muted/40 px-6 py-4">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold tracking-normal">
                        Draft proposal
                      </h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Edit freely, regenerate the hook, or copy when
                        you&apos;re happy.
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide",
                      isStreamingOutput
                        ? "bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100"
                        : "bg-emerald-500/15 text-emerald-900 ring-1 ring-emerald-500/25 dark:bg-emerald-950/35 dark:text-emerald-100",
                    )}
                  >
                    {isStreamingOutput ? "Generating" : "Ready"}
                  </span>
                </div>
                <div className="space-y-8 p-6 sm:p-8">
                  {/* Hook Section */}
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
                        Proposal Hook
                      </h4>
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Select
                          value={hookSelectValue}
                          onValueChange={handleHookSelect}
                        >
                          <SelectTrigger className="h-11! min-w-0 flex-1 rounded-lg border-border/80 bg-white sm:max-w-[220px] sm:min-w-[180px]">
                            <SelectValue placeholder="Select Hook Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>Built-in Hooks</SelectLabel>
                              <SelectItem value="Relatable Pain Point">
                                Relatable Pain Point
                              </SelectItem>
                              <SelectItem value="Callout + Quick Win">
                                Callout + Quick Win
                              </SelectItem>
                              <SelectItem value="Mini Case Study">
                                Mini Case Study
                              </SelectItem>
                              <SelectItem value="Custom">
                                Custom (manual)
                              </SelectItem>
                            </SelectGroup>
                            {organizationHooks.length > 0 && (
                              <SelectGroup>
                                <SelectLabel>My Hooks</SelectLabel>
                                {organizationHooks.map((h) => (
                                  <SelectItem key={h.id} value={`hook:${h.id}`}>
                                    {h.title}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                          </SelectContent>
                        </Select>

                        <Button
                          variant="outline"
                          onClick={handleRegenerateHook}
                          disabled={
                            regeneratingHook || generating || isStreamingOutput
                          }
                          className="shrink-0 gap-2"
                        >
                          {regeneratingHook ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Regenerate Hook
                        </Button>
                      </div>
                    </div>

                    {hookType === "Custom" && hookSelectValue === "Custom" && (
                      <div className="w-full">
                        <Input
                          placeholder="Enter custom hook instructions (e.g. 'Start with a joke about missing semicolons')"
                          value={customHookInstruction}
                          onChange={(e) =>
                            setCustomHookInstruction(e.target.value)
                          }
                          className="bg-white text-sm"
                        />
                      </div>
                    )}

                    <Textarea
                      className="min-h-[88px] rounded-xl border-border/70 bg-muted/40 p-4 font-sans text-sm whitespace-pre-wrap"
                      placeholder={
                        isStreamingOutput
                          ? "Streaming hook…"
                          : "Hook will appear here..."
                      }
                      value={
                        isStreamingOutput ? streamingParts.hook : generatedHook
                      }
                      readOnly={isStreamingOutput}
                      onChange={(e) => setGeneratedHook(e.target.value)}
                      onKeyDown={(e) =>
                        handleBoldKeyDown(e, generatedHook, setGeneratedHook)
                      }
                    />
                  </div>

                  <hr className="border-border" />

                  {/* Body Section */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
                      Proposal Body
                    </h4>
                    <Textarea
                      className="min-h-[280px] rounded-xl border-border/70 bg-muted/40 p-4 font-sans text-sm whitespace-pre-wrap"
                      placeholder={
                        isStreamingOutput
                          ? "Streaming body…"
                          : "Body will appear here..."
                      }
                      value={
                        isStreamingOutput ? streamingParts.body : generatedBody
                      }
                      readOnly={isStreamingOutput}
                      onChange={(e) => setGeneratedBody(e.target.value)}
                      onKeyDown={(e) =>
                        handleBoldKeyDown(e, generatedBody, setGeneratedBody)
                      }
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/25 px-4 py-3 text-[11px] font-medium text-muted-foreground">
                    <div className="flex gap-4">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Word Count:{" "}
                        {currentWordCount}
                      </span>
                      <span className="flex items-center gap-1">
                        Read Time: {readTime} min{readTime > 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="flex items-center gap-1">
                      Model: {generatedModel}
                    </span>
                  </div>

                  {/* Action Row */}
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Button
                      className="flex-1 min-w-[140px] bg-primary hover:bg-primary/90 text-primary-foreground"
                      onClick={() => void handleCopyText()}
                      title="Copy as plain text, for Upwork's proposal box"
                    >
                      <Copy className="h-4 w-4 mr-2" /> Copy Text
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 min-w-[140px]"
                      onClick={() => void handleCopyRichText()}
                      title="Copy with formatting, for email or a document"
                    >
                      <Code className="h-4 w-4 mr-2" /> Copy Rich Text
                    </Button>
                    {/* These two were icon-only with no label of any kind, so
                        nothing announced them and the disk icon was the only
                        clue that a draft could be saved at all. */}
                    <Button
                      variant="outline"
                      onClick={handleGenerate}
                      disabled={
                        generating ||
                        isStreamingOutput ||
                        personaGenerateBlocked
                      }
                      title={personaGenerateDisabledHint ?? "Generate again"}
                      aria-label="Generate this proposal again"
                    >
                      <RefreshCw
                        className={`h-4 w-4 mr-2 ${generating ? "animate-spin" : ""}`}
                      />
                      Regenerate
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleSave}
                      disabled={saving || isStreamingOutput}
                      title="Save this proposal as a draft"
                      aria-label="Save this proposal as a draft"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      {saving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              </section>
            )}
        </div>

        <footer className="mt-10 text-center pb-12">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
            Proposal lift
          </p>
        </footer>
      </div>
    </TooltipProvider>
  );
}
