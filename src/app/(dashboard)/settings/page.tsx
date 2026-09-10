"use client";

import { apiFetch } from "@/lib/api-fetch";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
} from "@/lib/ai/model-catalog";
import { useModelCatalog } from "@/lib/ai/use-model-catalog";
import {
  DEFAULT_AI_EFFORT,
  normalizeEffort,
  type AiEffort,
} from "@/lib/ai/effort";
import { useState, useEffect, Suspense, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Eye,
  EyeOff,
  HelpCircle,
  Lock,
  Settings as SettingsIcon,
  Zap,
  Trash2,
  Loader2,
  Briefcase,
  ExternalLink,
  Unplug,
  CheckCircle,
  XCircle,
  BookOpen,
  Pencil,
  AlertTriangle,
  Activity,
  Webhook,
  Copy,
  Check,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
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
import { redirectToUpworkOAuth } from "@/lib/upwork/start-oauth";
import { cn } from "@/lib/utils";
import { WebhookSettings } from "@/components/settings/WebhookSettings";
import { KnowledgeBaseExamplesDialog } from "@/components/settings/KnowledgeBaseExamplesDialog";
import { KnowledgeBaseUploadDialog } from "@/components/settings/KnowledgeBaseUploadDialog";
import { SettingsSaveBar } from "@/components/settings/SettingsSaveBar";
import { resolveGuardedDestination } from "@/lib/navigation/resolve-guarded-destination";

/**
 * Settings.
 *
 * Ported from a 3,548-line commercial page. What changed, and why:
 *
 * - **The AI Models tab is live.** Upstream rendered "AI Models: Coming Soon"
 *   and left `renderProviderCard` defined but never called, because that build
 *   had a platform OpenAI key and billed credits. Here the user's own key is the
 *   only key there is, and nothing in the app works without it, so this tab is
 *   load-bearing rather than optional.
 * - **No General tab.** It held agency branding, which lives on
 *   `organization_settings`. There are no organizations.
 * - **No access lock.** Billing and trial locks hid most of this page and forced
 *   the tab selection. No billing, no locks.
 * - **No shared Upwork access.** Everyone registers their own Upwork app.
 * - **No member/owner split.** One user owns every row they can see.
 * - **Account deletion is immediate**, not a 30-day scheduled grace period.
 * - **No video guide.** It pointed at hosted marketing videos. The written
 *   "Register your Upwork app" panel is the self-serve equivalent, and is the
 *   better fit for a self-hosted build.
 */

interface AIProvider {
  id: "openai" | "anthropic";
  name: string;
  /** Why this provider's key matters, shown under the header. */
  role: string;
  /** OpenAI is required; Anthropic is an alternative generation provider. */
  required: boolean;
  apiKey: string;
  isConnected: boolean;
  model: string;
  effort: AiEffort;
  maxTokens: number;
}

const defaultSystemPrompt = `You are a proposal writer. Generate professional, specific, persuasive Upwork proposals grounded in the freelancer's real experience. Focus on the client's stated problem and concrete next steps.`;

/** Ready-to-paste project description for the Upwork developer-app registration form. */
const UPWORK_APP_DESCRIPTION = `This is a self-hosted web application that helps a freelancer manage Upwork job discovery and proposal creation in one place.

Purpose: The application fetches relevant job listings through the Upwork Search API, then filters and qualifies them against saved criteria (budget range, client history, job category, and required skills) and surfaces suitable opportunities in a single dashboard. The user reviews job details and drafts tailored proposals.

Technical details: The application is self-hosted by the account owner. Authentication uses OAuth 2.0 with Supabase as the auth provider, and the account owner connects their own Upwork account.

API usage: Requests stay within the daily request limit, and rate limiting is applied client-side.

Compliance: The application does not use Upwork branding.`;

/** Fallback shown when the deployment's UPWORK_REDIRECT_URI isn't readable. */
const UPWORK_CALLBACK_FALLBACK = "https://<your-host>/auth/upwork/callback";

type ProviderSnapshot = {
  apiKey: string;
  model: string;
  effort: AiEffort;
  maxTokens: number;
};

type SettingsSnapshot = {
  openai: ProviderSnapshot;
  anthropic: ProviderSnapshot;
  fallbackModel: string;
  systemPrompt: string;
  knowledgeBase: string;
};

function providerSnapshotEqual(a: ProviderSnapshot, b: ProviderSnapshot) {
  return (
    a.apiKey === b.apiKey &&
    a.model === b.model &&
    a.effort === b.effort &&
    a.maxTokens === b.maxTokens
  );
}

/** GET /api/settings returns masked keys (`****…`); never persist that string as the secret. */
function isLikelyMaskedServerKey(key: string): boolean {
  return key.startsWith("****");
}

const TABS = [
  { id: "ai-models", label: "AI Models", icon: Zap },
  { id: "integrations", label: "Integrations", icon: Unplug },
  { id: "knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "security", label: "Security", icon: Lock },
] as const;

type TabId = (typeof TABS)[number]["id"];

function SettingsPageContent() {
  const { user, signOut } = useAuthStore(
    useShallow((state) => ({ user: state.user, signOut: state.signOut })),
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");

  /**
   * Active tab.
   *
   * Derived rather than synced from the URL. Upstream mirrored `?tab=` into
   * state inside an effect, which is a synchronous setState during render commit
   * (and a lint error under this project's newer eslint-config-next). A manual
   * click wins once made; until then the URL decides; failing both, Integrations,
   * because connecting Upwork is the primary first-run action.
   */
  const [manualTab, setManualTab] = useState<TabId | null>(null);
  const urlTab = TABS.some((t) => t.id === tabFromUrl)
    ? (tabFromUrl as TabId)
    : null;
  const activeTab: TabId = manualTab ?? urlTab ?? "integrations";
  const setActiveTab = setManualTab;

  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  /** User clicked the pencil to paste a replacement key. */
  const [openaiReplacingKey, setOpenaiReplacingKey] = useState(false);
  const [openaiKeyDraft, setOpenaiKeyDraft] = useState("");
  const [anthropicReplacingKey, setAnthropicReplacingKey] = useState(false);
  const [anthropicKeyDraft, setAnthropicKeyDraft] = useState("");
  /** Which provider is pending key removal, or null when the dialog is shut. */
  const [keyToRemove, setKeyToRemove] = useState<"openai" | "anthropic" | null>(
    null,
  );
  const [removingKey, setRemovingKey] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Only for the AI tab's Save; verify uses `saving`. */
  const [savingSettings, setSavingSettings] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(defaultSystemPrompt);
  const [fallbackModel, setFallbackModel] = useState(DEFAULT_OPENAI_MODEL);

  // Knowledge base state
  const [knowledgeBase, setKnowledgeBase] = useState("");
  const [savingKb, setSavingKb] = useState(false);
  /**
   * Single level of local undo for an inserted example or upload.
   *
   * Snapshots even when the field was empty: the only other way to remove
   * unwanted text is `Clear`, which is a server write, so a user who inserts the
   * wrong example into an empty field needs a local revert rather than a round
   * trip that also wipes what is saved.
   */
  const [kbUndo, setKbUndo] = useState<{ text: string; label: string } | null>(
    null,
  );
  const kbTextareaRef = useRef<HTMLTextAreaElement>(null);
  /** In-app destination held back by the unsaved-changes guard, if any. */
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  );
  const [clearKbDialogOpen, setClearKbDialogOpen] = useState(false);

  // Upwork integration state
  const [upworkConnected, setUpworkConnected] = useState(false);
  const [upworkConnectedAt, setUpworkConnectedAt] = useState<string | null>(
    null,
  );
  const [connectingUpwork, setConnectingUpwork] = useState(false);
  const [disconnectingUpwork, setDisconnectingUpwork] = useState(false);
  const [disconnectUpworkDialogOpen, setDisconnectUpworkDialogOpen] =
    useState(false);

  /** Which guideline value was just copied; drives the Copy → Check toggle. */
  const [copiedGuideField, setCopiedGuideField] = useState<string | null>(null);

  const [upworkClientId, setUpworkClientId] = useState("");
  const [upworkClientSecret, setUpworkClientSecret] = useState("");
  const [upworkSecretConfigured, setUpworkSecretConfigured] = useState(false);
  const [upworkOauthReady, setUpworkOauthReady] = useState(false);
  const [upworkRedirectHint, setUpworkRedirectHint] = useState<string | null>(
    null,
  );
  const [upworkOauthMessage, setUpworkOauthMessage] = useState<string | null>(
    null,
  );
  const [savingUpworkCreds, setSavingUpworkCreds] = useState(false);
  const [removingUpworkCreds, setRemovingUpworkCreds] = useState(false);
  const [removeUpworkCredsDialogOpen, setRemoveUpworkCredsDialogOpen] =
    useState(false);
  const [showUpworkClientSecret, setShowUpworkClientSecret] = useState(false);
  /** With both a client ID and a stored secret, the form stays collapsed until Edit. */
  const [upworkEditingOAuthApp, setUpworkEditingOAuthApp] = useState(false);
  /** Saved Client ID from the last fetch; used to detect edits and enable Save. */
  const [upworkOAuthClientIdBaseline, setUpworkOAuthClientIdBaseline] =
    useState("");

  const [upworkQuota, setUpworkQuota] = useState<{
    used: number;
    limit: number;
    remaining: number;
    resetAt: string;
  } | null>(null);

  // Security state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPasswordUI, setShowConfirmPasswordUI] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Account deletion state. No grace period: DELETE /api/account is immediate,
  // so there is nothing to poll for and nothing to undo.
  const [deleteConfirmDialogOpen, setDeleteConfirmDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  /** Baseline from the last load/save; used for dirty checks. */
  const [settingsSnapshot, setSettingsSnapshot] =
    useState<SettingsSnapshot | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  const [providers, setProviders] = useState<AIProvider[]>([
    {
      id: "openai",
      name: "OpenAI",
      role: "Required. Powers proposal generation, job qualifying, and the portfolio embeddings used to match projects to jobs.",
      required: true,
      apiKey: "",
      isConnected: false,
      model: DEFAULT_OPENAI_MODEL,
      effort: DEFAULT_AI_EFFORT,
      maxTokens: 2000,
    },
    {
      id: "anthropic",
      name: "Anthropic",
      role: "Optional. An alternative generation provider; embeddings always use OpenAI.",
      required: false,
      apiKey: "",
      isConnected: false,
      model: DEFAULT_ANTHROPIC_MODEL,
      effort: DEFAULT_AI_EFFORT,
      maxTokens: 2000,
    },
  ]);

  const openaiProvider = providers.find((p) => p.id === "openai");
  /** Nothing in the app works without this, so the warning is not decorative. */
  const missingOpenAiKey = !loadingSettings && !openaiProvider?.apiKey;

  const isDirtyAi = useMemo(() => {
    if (!settingsSnapshot) return false;
    const o = providers.find((p) => p.id === "openai");
    const a = providers.find((p) => p.id === "anthropic");
    if (!o || !a) return false;
    const replacingOpenaiDraft =
      openaiReplacingKey && openaiKeyDraft.trim().length > 0;
    const replacingAnthropicDraft =
      anthropicReplacingKey && anthropicKeyDraft.trim().length > 0;
    return (
      replacingOpenaiDraft ||
      replacingAnthropicDraft ||
      !providerSnapshotEqual(
        {
          apiKey: o.apiKey,
          model: o.model,
          effort: o.effort,
          maxTokens: o.maxTokens,
        },
        settingsSnapshot.openai,
      ) ||
      !providerSnapshotEqual(
        {
          apiKey: a.apiKey,
          model: a.model,
          effort: a.effort,
          maxTokens: a.maxTokens,
        },
        settingsSnapshot.anthropic,
      ) ||
      fallbackModel !== settingsSnapshot.fallbackModel ||
      systemPrompt !== settingsSnapshot.systemPrompt
    );
  }, [
    settingsSnapshot,
    providers,
    fallbackModel,
    systemPrompt,
    openaiReplacingKey,
    openaiKeyDraft,
    anthropicReplacingKey,
    anthropicKeyDraft,
  ]);

  const isDirtyKb = useMemo(() => {
    if (!settingsSnapshot) return false;
    return knowledgeBase !== settingsSnapshot.knowledgeBase;
  }, [settingsSnapshot, knowledgeBase]);

  const passwordFieldsFilled =
    currentPassword.trim().length > 0 &&
    newPassword.trim().length > 0 &&
    confirmPassword.trim().length > 0;

  const upworkOAuthAppFullyConfigured =
    upworkClientId.trim().length > 0 && upworkSecretConfigured;
  const showUpworkOAuthCredentialForm =
    !upworkOAuthAppFullyConfigured || upworkEditingOAuthApp;

  /**
   * Deliberately `||`, not `&&`: a half-saved app (Client ID stored but the
   * secret unreadable) never renders the configured card, and that is exactly
   * the state a user needs an exit from.
   */
  const canRemoveUpworkCredentials =
    upworkOAuthClientIdBaseline.trim().length > 0 || upworkSecretConfigured;

  /** Last 4 of the saved Client ID, so the user can tell which app they are removing. */
  const upworkClientIdPreview = useMemo(() => {
    const id = upworkOAuthClientIdBaseline.trim();
    if (!id) return null;
    return id.length <= 4 ? "••••" : `••••${id.slice(-4)}`;
  }, [upworkOAuthClientIdBaseline]);

  const upworkOAuthCredentialDirty = useMemo(() => {
    const idTrim = upworkClientId.trim();
    const baseline = upworkOAuthClientIdBaseline.trim();
    return idTrim !== baseline || upworkClientSecret.trim().length > 0;
  }, [upworkClientId, upworkOAuthClientIdBaseline, upworkClientSecret]);

  /** Mirrors the API rules: changing the Client ID requires a new secret (≥8 chars). */
  const upworkOAuthSaveBlocked = useMemo(() => {
    const idTrim = upworkClientId.trim();
    const baseline = upworkOAuthClientIdBaseline.trim();
    const secretTrim = upworkClientSecret.trim();
    const clearingCredentials = baseline.length > 0 && idTrim.length === 0;
    if (clearingCredentials) return false;

    const idChanged = idTrim !== baseline;
    const secretOk = secretTrim.length >= 8;

    if (secretTrim.length > 0 && secretTrim.length < 8) return true;
    if (idChanged && !secretOk) return true;
    if (!upworkSecretConfigured && idTrim.length > 0 && !secretOk) return true;
    return false;
  }, [
    upworkClientId,
    upworkOAuthClientIdBaseline,
    upworkClientSecret,
    upworkSecretConfigured,
  ]);

  const upworkOAuthSaveDisabled =
    savingUpworkCreds || !upworkOAuthCredentialDirty || upworkOAuthSaveBlocked;

  const isGoogleUser = user?.app_metadata?.provider === "google";

  const fetchSettings = async () => {
    try {
      const res = await apiFetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setProviders((prev) =>
          prev.map((p) => {
            if (p.id === "openai") {
              return {
                ...p,
                apiKey: data.openai_api_key || "",
                isConnected: !!data.openai_api_key,
                model: data.openai_model || p.model,
                effort: normalizeEffort(data.openai_effort),
                maxTokens: data.openai_max_tokens ?? 2000,
              };
            }
            return {
              ...p,
              apiKey: data.anthropic_api_key || "",
              isConnected: !!data.anthropic_api_key,
              model: data.anthropic_model || p.model,
              effort: normalizeEffort(data.anthropic_effort),
              maxTokens: data.anthropic_max_tokens ?? 2000,
            };
          }),
        );
        setFallbackModel(data.fallback_model || DEFAULT_OPENAI_MODEL);
        setSystemPrompt(data.system_prompt || defaultSystemPrompt);

        setUpworkConnected(!!data.upwork_connected);
        setUpworkConnectedAt(data.upwork_connected_at || null);
        const cid =
          typeof data.upwork_client_id === "string"
            ? data.upwork_client_id
            : "";
        setUpworkClientId(cid);
        setUpworkOAuthClientIdBaseline(cid);
        setUpworkClientSecret("");
        setUpworkSecretConfigured(!!data.upwork_client_secret_configured);
        setUpworkOauthReady(!!data.upwork_oauth_ready);
        setUpworkRedirectHint(
          typeof data.upwork_redirect_uri_hint === "string"
            ? data.upwork_redirect_uri_hint
            : null,
        );
        setUpworkOauthMessage(
          typeof data.upwork_oauth_message === "string"
            ? data.upwork_oauth_message
            : null,
        );

        setKnowledgeBase(data.knowledge_base || "");
        // Fresh server state: any pending undo points at a stale value.
        setKbUndo(null);

        setSettingsSnapshot({
          openai: {
            apiKey: data.openai_api_key || "",
            model: data.openai_model || DEFAULT_OPENAI_MODEL,
            effort: normalizeEffort(data.openai_effort),
            maxTokens: data.openai_max_tokens ?? 2000,
          },
          anthropic: {
            apiKey: data.anthropic_api_key || "",
            model: data.anthropic_model || DEFAULT_ANTHROPIC_MODEL,
            effort: normalizeEffort(data.anthropic_effort),
            maxTokens: data.anthropic_max_tokens ?? 2000,
          },
          fallbackModel: data.fallback_model || DEFAULT_OPENAI_MODEL,
          systemPrompt: data.system_prompt || defaultSystemPrompt,
          knowledgeBase: data.knowledge_base || "",
        });
        setOpenaiReplacingKey(false);
        setOpenaiKeyDraft("");
        setAnthropicReplacingKey(false);
        setAnthropicKeyDraft("");
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoadingSettings(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    // Awaited inside an async IIFE rather than called directly: every setState
    // in `fetchSettings` happens after its first await, but the effect lint rule
    // cannot see through a plain call to prove that.
    void (async () => {
      await fetchSettings();
    })();
    // Re-runs on identity change alone; `fetchSettings` closes over setters
    // only, so leaving it out of the deps cannot go stale.
  }, [user]);

  useEffect(() => {
    if (!upworkConnected || activeTab !== "integrations") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/api/upwork/quota");
        const data = await res.json();
        if (!cancelled && data && typeof data.used === "number") {
          setUpworkQuota(data);
        }
      } catch {
        // A missing quota widget is not worth surfacing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [upworkConnected, activeTab]);

  const oauthCallbackStatus = searchParams.get("upwork");
  const oauthCallbackMessage = searchParams.get("message");
  useEffect(() => {
    if (!oauthCallbackStatus) return;
    if (oauthCallbackStatus === "connected") {
      toast.success("Upwork connected successfully.");
      void (async () => {
        await fetchSettings();
      })();
    } else if (oauthCallbackStatus === "error") {
      toast.error(
        oauthCallbackMessage
          ? decodeURIComponent(oauthCallbackMessage)
          : "Upwork connection failed.",
      );
    }
    router.replace("/settings?tab=integrations", { scroll: false });
  }, [oauthCallbackStatus, oauthCallbackMessage, router]);

  const updateProvider = (id: string, updates: Partial<AIProvider>) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    );
  };

  /**
   * The models each provider actually offers this user's key.
   *
   * Gated on the tab so the other four tabs cost nothing. Nothing is hardcoded
   * here any more: a model the provider does not return is a model this app
   * will not offer, which is what stops the list going stale between releases.
   */
  const modelCatalog = useModelCatalog(activeTab === "ai-models");

  /**
   * Options for one provider's model select.
   *
   * Two rules, both deliberate. A provider with no key gets an empty list, not
   * a leftover default — offering models against a key that does not exist is
   * how the old hardcoded lists misled people. And a connected provider always
   * keeps its own saved model in the list even when the lookup failed, so a
   * network blip can never silently drop the user's selection.
   */
  const modelsForProvider = (provider: AIProvider): string[] => {
    if (!provider.isConnected) return [];
    const live = modelCatalog.catalog[provider.id].models;
    if (!provider.model || live.includes(provider.model)) return live;
    return [provider.model, ...live];
  };

  /**
   * Every model any connected provider offers, for the fallback select.
   *
   * Deduped because the two providers now draw from independent live lists, and
   * a repeated id would collide as a React key.
   */
  const fallbackOptions = Array.from(
    new Set(providers.flatMap(modelsForProvider)),
  );

  const copyGuideValue = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedGuideField(field);
      setTimeout(
        () => setCopiedGuideField((c) => (c === field ? null : c)),
        1500,
      );
    } catch {
      toast.error("Couldn't copy. Please copy manually.");
    }
  };

  const renderCopyGuideButton = (field: string, value: string) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="shrink-0 text-muted-foreground"
      onClick={() => void copyGuideValue(field, value)}
      aria-label={copiedGuideField === field ? "Copied" : "Copy"}
      title="Copy"
    >
      {copiedGuideField === field ? (
        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );

  const handleVerifyKey = async (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;

    const replacing =
      providerId === "openai" ? openaiReplacingKey : anthropicReplacingKey;
    const draft = providerId === "openai" ? openaiKeyDraft : anthropicKeyDraft;
    const apiKeyToVerify =
      replacing && draft.trim() ? draft.trim() : provider.apiKey.trim();

    if (!apiKeyToVerify) {
      toast.error("Please enter an API key first.");
      return;
    }
    if (isLikelyMaskedServerKey(apiKeyToVerify)) {
      toast.error(
        "Paste your full secret key. Click the pencil, then paste the key before verifying.",
      );
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch("/api/settings/verify-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, apiKey: apiKeyToVerify }),
      });
      const data = (await res.json()) as {
        valid?: boolean;
        status?: "valid" | "invalid" | "unknown";
        message?: string;
      };

      if (data.valid) {
        updateProvider(providerId, { isConnected: true });
        toast.success(`${provider.name} API key verified successfully.`);
      } else if (data.status === "unknown") {
        // Not proven wrong, just unreachable. Saying "invalid" here would send
        // the user hunting for a problem with a key that is fine.
        toast.warning("Could not check this key", {
          description: data.message,
        });
      } else {
        updateProvider(providerId, { isConnected: false });
        toast.error(data.message || `${provider.name} API key is invalid.`);
      }
    } catch {
      toast.error("Failed to verify API key.");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Deletes a stored provider key.
   *
   * Its own request rather than part of Save: removal has to work even while
   * the rest of the form holds unsaved edits, and it must not be mistakable for
   * "clear the input and press Save" — which sends nothing, because the client
   * only PUTs keys that changed to a non-empty value.
   *
   * `null`, not "": both read as absent through `resolveOpenAIApiKey`, but only
   * one of them looks absent in the database.
   */
  const handleRemoveKey = async () => {
    const providerId = keyToRemove;
    if (!providerId) return;

    const provider = providers.find((p) => p.id === providerId);
    setRemovingKey(true);
    try {
      const field =
        providerId === "openai" ? "openai_api_key" : "anthropic_api_key";
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: null }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          (data as { error?: string }).error || "Failed to remove the API key.",
        );
        return;
      }

      // Drop the local copy too, or the field keeps showing the mask for a key
      // the server no longer has.
      updateProvider(providerId, { apiKey: "", isConnected: false });
      if (providerId === "openai") {
        setOpenaiReplacingKey(false);
        setOpenaiKeyDraft("");
      } else {
        setAnthropicReplacingKey(false);
        setAnthropicKeyDraft("");
      }
      setKeyToRemove(null);
      toast.success(`${provider?.name ?? "API"} key removed.`);
      // The catalog this key produced is now unreachable; drop it rather than
      // let a stale list outlive the credential it came from.
      modelCatalog.refresh();
      await fetchSettings();
    } catch {
      toast.error("Failed to remove the API key.");
    } finally {
      setRemovingKey(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!isDirtyAi) return;
    setSavingSettings(true);
    try {
      const openai = providers.find((p) => p.id === "openai")!;
      const anthropic = providers.find((p) => p.id === "anthropic")!;

      const resolvedOpenAiKey =
        openaiReplacingKey && openaiKeyDraft.trim()
          ? openaiKeyDraft.trim()
          : undefined;
      const resolvedAnthropicKey =
        anthropicReplacingKey && anthropicKeyDraft.trim()
          ? anthropicKeyDraft.trim()
          : undefined;

      const openaiFromPlaintextInput =
        !openaiReplacingKey &&
        openai.apiKey.trim() &&
        !isLikelyMaskedServerKey(openai.apiKey.trim())
          ? openai.apiKey.trim()
          : undefined;

      const anthropicFromPlaintextInput =
        !anthropicReplacingKey &&
        anthropic.apiKey.trim() &&
        !isLikelyMaskedServerKey(anthropic.apiKey.trim())
          ? anthropic.apiKey.trim()
          : undefined;

      /** Only send keys being intentionally changed; never PUT the masked preview. */
      const body: Record<string, unknown> = {
        fallback_model: fallbackModel,
        system_prompt: systemPrompt,
        openai_model: openai.model,
        openai_effort: openai.effort,
        openai_max_tokens: openai.maxTokens,
        anthropic_model: anthropic.model,
        anthropic_effort: anthropic.effort,
        anthropic_max_tokens: anthropic.maxTokens,
      };

      const nextOpenAi = resolvedOpenAiKey ?? openaiFromPlaintextInput;
      if (nextOpenAi !== undefined) body.openai_api_key = nextOpenAi;
      const nextAnthropic = resolvedAnthropicKey ?? anthropicFromPlaintextInput;
      if (nextAnthropic !== undefined) body.anthropic_api_key = nextAnthropic;

      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        // The save gate verifies any key being changed. A warning means it was
        // stored without that check succeeding, which the user should know
        // before they wonder why generation fails later.
        const data = (await res.json().catch(() => ({}))) as {
          warnings?: string[];
        };
        if (data.warnings?.length) {
          toast.warning("Settings saved, but a key could not be checked", {
            description: data.warnings.join(" "),
          });
        } else {
          toast.success("Settings saved.");
        }
        // A changed key means a different catalog. There is no refresh button,
        // so this is the only path from "I just added my key" to "I can see my
        // models" — without it the cached empty list would stand for hours.
        if (nextOpenAi !== undefined || nextAnthropic !== undefined) {
          modelCatalog.refresh();
        }
        await fetchSettings();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save settings.");
      }
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleClearKnowledgeBase = async () => {
    setClearKbDialogOpen(false);
    setSavingKb(true);
    try {
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledge_base: "" }),
      });
      if (res.ok) {
        setKnowledgeBase("");
        setSettingsSnapshot((prev) =>
          prev ? { ...prev, knowledgeBase: "" } : null,
        );
        // The snapshot would now restore text that no longer exists on the
        // server, so the affordance has to go.
        setKbUndo(null);
        toast.success("Knowledge base cleared.");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(
          (data as { error?: string }).error ||
            "Failed to clear knowledge base.",
        );
      }
    } catch {
      toast.error("Failed to clear knowledge base.");
    } finally {
      setSavingKb(false);
    }
  };

  const handleSaveUpworkAppCredentials = async () => {
    setSavingUpworkCreds(true);
    try {
      const body: Record<string, unknown> = {};
      const idTrim = upworkClientId.trim();
      body.upwork_client_id = idTrim.length === 0 ? null : idTrim;
      const secretTrim = upworkClientSecret.trim();
      if (secretTrim.length > 0) body.upwork_client_secret = secretTrim;

      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Upwork app credentials saved.");
        setUpworkClientSecret("");
        setUpworkEditingOAuthApp(false);
        await fetchSettings();
      } else {
        toast.error(
          typeof data.error === "string"
            ? data.error
            : "Failed to save Upwork credentials.",
        );
      }
    } catch {
      toast.error("Failed to save Upwork credentials.");
    } finally {
      setSavingUpworkCreds(false);
    }
  };

  /**
   * Removes the user's Upwork app credentials.
   *
   * The cascade (tokens, cached vendor orgs) is not optional: Upwork's refresh
   * grant authenticates with the client id and secret, so a refresh token left
   * behind would be unusable and the next expiry would clear it anyway.
   */
  const handleRemoveUpworkAppCredentials = async () => {
    setRemovingUpworkCreds(true);
    try {
      const res = await apiFetch("/api/upwork/credentials", {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRemoveUpworkCredsDialogOpen(false);
        setUpworkClientSecret("");
        setShowUpworkClientSecret(false);
        setUpworkEditingOAuthApp(false);
        await fetchSettings();
        toast.success(
          "Upwork app credentials removed and account disconnected.",
        );
      } else {
        // Dialog stays open so the user can retry without re-navigating.
        toast.error(
          typeof (data as { error?: string }).error === "string"
            ? (data as { error: string }).error
            : "Failed to remove Upwork credentials.",
        );
      }
    } catch {
      toast.error("Failed to remove Upwork credentials.");
    } finally {
      setRemovingUpworkCreds(false);
    }
  };

  const handleEditUpworkOAuthApp = () => {
    setUpworkEditingOAuthApp(true);
    setUpworkClientSecret("");
    setShowUpworkClientSecret(false);
  };

  const handleCancelUpworkOAuthEdit = async () => {
    setUpworkEditingOAuthApp(false);
    setUpworkClientSecret("");
    setShowUpworkClientSecret(false);
    await fetchSettings();
  };

  const handleConnectUpwork = async () => {
    setConnectingUpwork(true);
    try {
      await redirectToUpworkOAuth();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to connect to Upwork.",
      );
      setConnectingUpwork(false);
    }
  };

  const handleDisconnectUpwork = async () => {
    setDisconnectingUpwork(true);
    try {
      const res = await apiFetch("/api/upwork/disconnect", { method: "POST" });
      if (res.ok) {
        setUpworkConnected(false);
        setUpworkConnectedAt(null);
        setUpworkQuota(null);
        setDisconnectUpworkDialogOpen(false);
        toast.success("Upwork disconnected.");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to disconnect.");
      }
    } catch {
      toast.error("Failed to disconnect Upwork.");
    } finally {
      setDisconnectingUpwork(false);
    }
  };

  const handleSaveKnowledgeBase = async () => {
    if (!isDirtyKb) return;
    setSavingKb(true);
    try {
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledge_base: knowledgeBase }),
      });
      if (res.ok) {
        setSettingsSnapshot((prev) =>
          prev ? { ...prev, knowledgeBase } : null,
        );
        // Undoing back past a save would silently reintroduce unsaved state.
        setKbUndo(null);
        toast.success("Knowledge base saved.");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save knowledge base.");
      }
    } catch {
      toast.error("Failed to save knowledge base.");
    } finally {
      setSavingKb(false);
    }
  };

  /**
   * Focuses the field after an insert so the text reads as an editable starting
   * point rather than a finished answer. Deferred one tick because Radix returns
   * focus to the dialog trigger on close.
   *
   * Caret at the start: an example is a ~1,800 character document whose first
   * line is a fictional company name, so the edit the user needs is at the top.
   */
  const focusKbStart = () => {
    setTimeout(() => {
      const el = kbTextareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(0, 0);
      el.scrollTop = 0;
    }, 0);
  };

  const handleApplyKbExample = (text: string) => {
    // Snapshot for undo only. Deliberately does NOT touch settingsSnapshot:
    // that would make an unsaved insert look already-saved and permanently
    // disable the Save button.
    setKbUndo({ text: knowledgeBase, label: "Undo example" });
    setKnowledgeBase(text);
    toast.success("Example applied. Edit it to match your work, then save.");
    focusKbStart();
  };

  /** The mirror of focusKbStart, for an insert that appends rather than replaces. */
  const focusKbEnd = () => {
    setTimeout(() => {
      const el = kbTextareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.scrollTop = el.scrollHeight;
    }, 0);
  };

  const handleApplyKbUpload = (text: string, filename: string) => {
    setKbUndo({ text: knowledgeBase, label: "Undo upload" });
    // Appends rather than replaces. A knowledge base the user curated is not
    // recoverable from the server once overwritten, and an upload is additive.
    const heading = `## From ${filename}`;
    setKnowledgeBase((prev) =>
      prev.trim()
        ? `${prev.trimEnd()}\n\n${heading}\n\n${text}`
        : `${heading}\n\n${text}`,
    );
    toast.success("Document added. Edit it to match your work, then save.");
    focusKbEnd();
  };

  const handleUndoKb = () => {
    if (!kbUndo) return;
    setKnowledgeBase(kbUndo.text);
    setKbUndo(null);
  };

  /**
   * Warns before an unsaved knowledge base is thrown away.
   *
   * Two mechanisms, because one cannot cover both cases. Closing the tab,
   * reloading, or leaving for another site is caught by the browser's own
   * `beforeunload` prompt. Client-side navigation never fires that event and the
   * App Router has no route-change guard, so in-app links are intercepted on
   * click and confirmed through the dialog below.
   *
   * Switching settings tabs is deliberately NOT guarded: those buttons only swap
   * which panel renders, so `knowledgeBase` stays in state and the draft is
   * still there. Prompting there would claim a loss that does not happen.
   */
  useEffect(() => {
    if (!isDirtyKb) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers key off returnValue; the string is ignored and every
      // modern browser shows its own wording.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirtyKb]);

  useEffect(() => {
    if (!isDirtyKb) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const destination = resolveGuardedDestination({
        href: anchor.getAttribute("href") ? anchor.href : null,
        target: anchor.getAttribute("target"),
        hasDownload: anchor.hasAttribute("download"),
        modifierKey: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
        button: e.button,
        origin: window.location.origin,
        currentPathWithSearch: `${window.location.pathname}${window.location.search}`,
      });
      if (!destination) return;
      e.preventDefault();
      setPendingNavigation(destination);
    };
    // Capture phase, so this runs before the router's own click handler.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [isDirtyKb]);

  const handleDiscardAndLeave = () => {
    if (!pendingNavigation) return;
    const to = pendingNavigation;
    setPendingNavigation(null);
    // Programmatic, so the click interceptor above cannot catch it again.
    router.push(to);
  };

  /**
   * Staying put is only useful if the user can act on what stopped them. The
   * guard fires from any tab, so someone editing the knowledge base, switching
   * to Webhooks, then clicking a sidebar link would otherwise be held on a page
   * showing no sign of the unsaved draft.
   */
  const handleStayOnPage = () => {
    setPendingNavigation(null);
    setActiveTab("knowledge-base");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordFieldsFilled) return;
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("Password changed. Signing you out...");
        await signOut();
        router.push("/login");
      } else {
        toast.error(data.error || "Failed to change password.");
      }
    } catch {
      toast.error("An error occurred. Please try again.");
    } finally {
      setPasswordSaving(false);
    }
  };

  /**
   * Immediate and irreversible.
   *
   * Upstream scheduled deletion 30 days out and offered an undo. There is no
   * scheduler here, so the confirmation carries the whole weight: the user types
   * their own email address, which is harder to do by reflex than "DELETE".
   */
  const handleDeleteAccount = async () => {
    const email = user?.email ?? "";
    if (deleteConfirmText.trim().toLowerCase() !== email.toLowerCase()) {
      toast.error("Type your account email exactly to confirm.");
      return;
    }
    setDeletingAccount(true);
    try {
      const res = await apiFetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: deleteConfirmText.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Account deleted.");
        await signOut();
        router.push("/login");
      } else {
        toast.error(
          (data as { error?: string }).error || "Failed to delete account.",
        );
        setDeletingAccount(false);
      }
    } catch {
      toast.error("Failed to delete account.");
      setDeletingAccount(false);
    }
  };

  const renderProviderCard = (provider: AIProvider) => {
    const isShowingKey =
      provider.id === "openai" ? showOpenAIKey : showAnthropicKey;
    const toggleShowKey =
      provider.id === "openai" ? setShowOpenAIKey : setShowAnthropicKey;
    const replacing =
      provider.id === "openai" ? openaiReplacingKey : anthropicReplacingKey;
    const setReplacing =
      provider.id === "openai"
        ? setOpenaiReplacingKey
        : setAnthropicReplacingKey;
    const draft = provider.id === "openai" ? openaiKeyDraft : anthropicKeyDraft;
    const setDraft =
      provider.id === "openai" ? setOpenaiKeyDraft : setAnthropicKeyDraft;
    const masked = isLikelyMaskedServerKey(provider.apiKey.trim());
    const showMaskedReadonly = masked && !replacing;

    const inputValue = replacing ? draft : provider.apiKey;
    const inputType = isShowingKey ? "text" : "password";

    const keyForVerifyUi = replacing ? draft.trim() : provider.apiKey.trim();
    const verifyDisabled =
      saving || !keyForVerifyUi || isLikelyMaskedServerKey(keyForVerifyUi);

    const providerModels = modelsForProvider(provider);
    /*
      Only a provider that has a key can have *failed*. Without one there is
      nothing to report — an empty list is simply where every new user starts,
      and dressing that up as an error would be its own bug.
    */
    const catalogError = provider.isConnected
      ? modelCatalog.catalog[provider.id].error
      : null;
    const modelPlaceholder = modelCatalog.loading
      ? "Loading models…"
      : provider.isConnected
        ? "No models available"
        : "Add an API key to load models";

    return (
      <div
        key={provider.id}
        className="bg-card border rounded-xl overflow-hidden shadow-sm"
      >
        <div className="p-6 border-b">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-bold text-lg">{provider.name}</h3>
            {provider.required ? (
              <Badge variant="outline" className="border-primary/50">
                Required
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Optional
              </Badge>
            )}
            <Badge
              className={
                provider.isConnected
                  ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-muted text-muted-foreground"
              }
            >
              <span
                className={cn(
                  "size-1.5 rounded-full mr-1.5",
                  provider.isConnected ? "bg-green-500" : "bg-muted-foreground",
                )}
              />
              {provider.isConnected ? "Key saved" : "Not configured"}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{provider.role}</p>
        </div>

        <div className="p-6 grid gap-8 grid-cols-1 md:grid-cols-2">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold mb-2">API Key</label>
              {replacing ? (
                <p className="text-xs text-muted-foreground mb-2">
                  Paste your full secret below. It is written to the server only
                  when you click <strong>Save</strong>. Use{" "}
                  <strong>Verify</strong> to test it first.
                </p>
              ) : masked ? (
                <p className="text-xs text-muted-foreground mb-2">
                  The stored key is masked. Click the pencil to replace it.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[160px]">
                  <Input
                    type={inputType}
                    value={inputValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (replacing) setDraft(v);
                      else updateProvider(provider.id, { apiKey: v });
                    }}
                    placeholder={
                      replacing
                        ? "Paste full API secret"
                        : `Enter ${provider.name} API key`
                    }
                    className={cn((replacing || !masked) && "pr-10")}
                    readOnly={showMaskedReadonly}
                    spellCheck={false}
                    autoComplete="new-password"
                  />
                  {(replacing || !masked) && (
                    <button
                      type="button"
                      aria-label={
                        isShowingKey ? "Hide API key" : "Reveal API key"
                      }
                      onClick={() => toggleShowKey(!isShowingKey)}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      {isShowingKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
                {masked &&
                  (!replacing ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Replace API key"
                      aria-label="Replace API key"
                      onClick={() => {
                        setReplacing(true);
                        setDraft("");
                        toggleShowKey(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setReplacing(false);
                        setDraft("");
                      }}
                    >
                      Cancel
                    </Button>
                  ))}
                <Button
                  type="button"
                  onClick={() => void handleVerifyKey(provider.id)}
                  variant="outline"
                  disabled={verifyDisabled}
                >
                  Verify
                </Button>
                {/* Only when a key is actually stored server-side (`masked`),
                    and not mid-replacement, where Cancel is the way out. */}
                {masked && !replacing && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() =>
                      setKeyToRemove(
                        provider.id === "openai" ? "openai" : "anthropic",
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">Model</label>
              <Select
                /*
                  Blank rather than the saved id when there are no options, so
                  the trigger shows the placeholder instead of naming a model
                  the user cannot currently reach. The stored value is
                  untouched — this only controls what the closed select renders.
                */
                value={providerModels.length > 0 ? provider.model : ""}
                onValueChange={(value) =>
                  updateProvider(provider.id, { model: value })
                }
                disabled={providerModels.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={modelPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {providerModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {catalogError ? (
                <p className="mt-2 text-xs text-destructive/90">
                  {catalogError}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-6">
            <div>
              {/*
                This was a PRECISE-to-CREATIVE temperature slider. Both labels
                described variance, which effort does not control — and the
                value behind them was rejected outright by the current model
                generations. The explanation lives in the hint rather than as
                body text: it is worth reading once, not on every visit.
              */}
              <div className="flex items-center gap-1.5 mb-2">
                <label className="text-sm font-bold">Effort</label>
                {/* Scoped to the hint rather than the page root: a root
                    provider reindents the entire tree for one tooltip. */}
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="What does effort mean?"
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <HelpCircle className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56">
                      How hard the model works on each proposal. Higher is more
                      thorough, slower, and costs more against your own API key.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={provider.effort}
                onValueChange={(value) =>
                  updateProvider(provider.id, {
                    effort: normalizeEffort(value),
                  })
                }
              >
                <SelectTrigger aria-label={`${provider.name} effort`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">
                    Low{" "}
                    <span className="text-muted-foreground">
                      fastest and cheapest
                    </span>
                  </SelectItem>
                  <SelectItem value="medium">
                    Medium <span className="text-muted-foreground">balanced</span>
                  </SelectItem>
                  <SelectItem value="high">
                    High{" "}
                    <span className="text-muted-foreground">most thorough</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">Max Tokens</label>
              <Input
                type="number"
                value={provider.maxTokens}
                onChange={(e) =>
                  updateProvider(provider.id, {
                    maxTokens: parseInt(e.target.value) || 0,
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sub-navigation */}
      <div className="px-4 sm:px-6 pb-4">
        <h2 className="text-2xl font-heading mb-4">Settings</h2>
        <nav className="flex gap-1 bg-card rounded-xl p-1 w-full sm:w-fit flex-wrap">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground hover:bg-background/60",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Nothing in the app works without an OpenAI key, so this is a blocker,
            not a hint. Shown on every tab until the key is saved. */}
        {missingOpenAiKey ? (
          <div className="mt-4 flex gap-3 rounded-lg border border-amber-300/70 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/25">
            <AlertTriangle
              className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400"
              aria-hidden
            />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                Add your OpenAI API key to get started
              </p>
              <p className="text-xs text-amber-900/85 dark:text-amber-200/80">
                This build has no shared API key. Every AI feature uses your
                own. Proposal generation, job qualifying, and portfolio matching
                all stay unavailable until you save one under{" "}
                <button
                  type="button"
                  onClick={() => setActiveTab("ai-models")}
                  className="font-semibold underline underline-offset-2"
                >
                  AI Models
                </button>
                .
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        {activeTab === "ai-models" &&
          (loadingSettings ? (
            <div className="max-w-6xl space-y-6">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="bg-card border rounded-xl overflow-hidden shadow-sm"
                >
                  <div className="p-6 border-b space-y-2">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-80" />
                  </div>
                  <div className="p-6 grid gap-8 grid-cols-1 md:grid-cols-2">
                    <div className="space-y-6">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-6">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="max-w-6xl space-y-6">
              {providers.map(renderProviderCard)}

              <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="p-6 border-b">
                  <h3 className="font-bold text-lg">Generation defaults</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Applied to every proposal unless a template overrides them.
                  </p>
                </div>
                <div className="p-6 space-y-6">
                  <div>
                    <label className="block text-sm font-bold mb-2">
                      Fallback model
                    </label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Used when the primary model is unavailable.
                    </p>
                    <Select
                      value={fallbackOptions.length > 0 ? fallbackModel : ""}
                      onValueChange={setFallbackModel}
                      disabled={fallbackOptions.length === 0}
                    >
                      <SelectTrigger className="max-w-sm">
                        <SelectValue placeholder="Add an API key to load models" />
                      </SelectTrigger>
                      <SelectContent>
                        {fallbackOptions.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label
                      htmlFor="system-prompt"
                      className="block text-sm font-bold mb-2"
                    >
                      System prompt
                    </label>
                    <Textarea
                      id="system-prompt"
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      rows={6}
                      className="font-mono text-sm resize-y field-sizing-fixed max-h-[40vh] overflow-y-auto"
                    />
                  </div>
                </div>
              </div>

              <SettingsSaveBar
                isDirty={isDirtyAi}
                saving={savingSettings}
                onSave={() => void handleSaveSettings()}
                saveLabel="Save"
              />
            </div>
          ))}

        {activeTab === "integrations" &&
          (loadingSettings ? (
            <div className="grid max-w-6xl grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_380px]">
              <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
                <div className="p-6 border-b flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-lg" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-5 w-28" />
                      <Skeleton className="h-4 w-64" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
                <div className="p-6 space-y-6">
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-9 w-36" />
                  </div>
                </div>
              </div>
              <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
                <div className="p-6 border-b space-y-1.5">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-4 w-56" />
                </div>
                <div className="p-6 space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="space-y-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid max-w-6xl grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_380px]">
              {/* Upwork Integration Card */}
              <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
                <div className="p-6 border-b flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="size-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center shrink-0">
                      <Briefcase className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Upwork API</h3>
                      <p className="text-sm text-muted-foreground">
                        Connect your own Upwork account to pull live job
                        postings
                      </p>
                    </div>
                  </div>
                  {upworkConnected ? (
                    <Badge className="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle className="h-3 w-3 mr-1.5" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge className="bg-muted text-muted-foreground">
                      <XCircle className="h-3 w-3 mr-1.5" />
                      Not Connected
                    </Badge>
                  )}
                </div>

                <div className="p-6 space-y-6">
                  {/* Daily API quota */}
                  {upworkConnected &&
                    upworkQuota &&
                    (() => {
                      const pct = upworkQuota.used / upworkQuota.limit;
                      const isCritical = pct >= 0.95;
                      const isHigh = pct >= 0.8;
                      const statusColor = isCritical
                        ? {
                            icon: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
                            bar: "bg-red-500",
                            badge:
                              "border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
                            dot: "bg-red-500",
                            stat: "text-red-600 dark:text-red-400",
                          }
                        : isHigh
                          ? {
                              icon: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400",
                              bar: "bg-yellow-500",
                              badge:
                                "border-yellow-200 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20",
                              dot: "bg-yellow-500",
                              stat: "text-yellow-600 dark:text-yellow-400",
                            }
                          : {
                              icon: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
                              bar: "bg-green-500",
                              badge:
                                "border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20",
                              dot: "bg-green-500",
                              stat: "text-green-600 dark:text-green-400",
                            };

                      return (
                        <div className="rounded-xl border border-border bg-card overflow-hidden">
                          <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  "size-9 rounded-lg flex items-center justify-center shrink-0",
                                  statusColor.icon,
                                )}
                              >
                                <Activity className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold leading-tight">
                                  API Usage Today
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Resets at midnight UTC
                                </p>
                              </div>
                            </div>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border",
                                statusColor.badge,
                              )}
                            >
                              <span
                                className={cn(
                                  "size-1.5 rounded-full",
                                  statusColor.dot,
                                )}
                              />
                              {isCritical
                                ? "Critical"
                                : isHigh
                                  ? "High"
                                  : "Normal"}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 divide-x divide-border/60">
                            <div className="px-5 py-4 text-center">
                              <p className="text-xl font-bold tracking-tight">
                                {upworkQuota.used.toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Used
                              </p>
                            </div>
                            <div className="px-5 py-4 text-center">
                              <p
                                className={cn(
                                  "text-xl font-bold tracking-tight",
                                  statusColor.stat,
                                )}
                              >
                                {upworkQuota.remaining.toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Remaining
                              </p>
                            </div>
                            <div className="px-5 py-4 text-center">
                              <p className="text-xl font-bold tracking-tight text-muted-foreground">
                                {upworkQuota.limit.toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Daily Limit
                              </p>
                            </div>
                          </div>

                          <div className="px-5 pb-4 pt-1">
                            <div className="flex justify-between text-xs text-muted-foreground mb-2">
                              <span>{(pct * 100).toFixed(1)}% used</span>
                              <span>
                                {upworkQuota.remaining.toLocaleString()}{" "}
                                remaining
                              </span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-500",
                                  statusColor.bar,
                                )}
                                style={{
                                  width: `${Math.min(100, pct * 100).toFixed(1)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                  <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                      <h4 className="font-semibold text-sm shrink-0">
                        Your Upwork OAuth application
                      </h4>
                      {upworkOauthReady ? (
                        <Badge
                          variant="outline"
                          className="border-green-600/50 text-green-700 dark:text-green-400 shrink-0"
                        >
                          OAuth ready
                        </Badge>
                      ) : (
                        <Badge
                          variant="destructive"
                          className="text-xs shrink-0"
                        >
                          OAuth not configured
                        </Badge>
                      )}
                    </div>

                    {showUpworkOAuthCredentialForm ? (
                      <>
                        <p className="text-sm text-muted-foreground">
                          Register an app in the Upwork developer portal and
                          paste its Client ID and Client Secret here. Use the
                          same redirect URI in Upwork as shown below.
                        </p>
                        {upworkRedirectHint ? (
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-muted-foreground uppercase">
                              Redirect URI (register this in Upwork)
                            </label>
                            <Input
                              readOnly
                              className="font-mono text-xs"
                              value={upworkRedirectHint}
                            />
                          </div>
                        ) : null}
                        <div className="grid gap-3">
                          <div className="space-y-1.5">
                            <label
                              htmlFor="upwork-client-id"
                              className="text-xs font-bold text-muted-foreground uppercase"
                            >
                              Client ID
                            </label>
                            <Input
                              id="upwork-client-id"
                              value={upworkClientId}
                              onChange={(e) =>
                                setUpworkClientId(e.target.value)
                              }
                              placeholder="From your Upwork developer app"
                              className="font-mono text-xs"
                              autoComplete="off"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label
                              htmlFor="upwork-client-secret"
                              className="text-xs font-bold text-muted-foreground uppercase"
                            >
                              Client Secret
                            </label>
                            <div className="relative">
                              <Input
                                id="upwork-client-secret"
                                type={
                                  showUpworkClientSecret ? "text" : "password"
                                }
                                value={upworkClientSecret}
                                onChange={(e) =>
                                  setUpworkClientSecret(e.target.value)
                                }
                                placeholder={
                                  upworkSecretConfigured
                                    ? "Leave blank to keep existing secret"
                                    : "Required with Client ID"
                                }
                                className="font-mono text-xs pr-10"
                                autoComplete="new-password"
                              />
                              <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                                onClick={() =>
                                  setShowUpworkClientSecret(
                                    !showUpworkClientSecret,
                                  )
                                }
                                aria-label={
                                  showUpworkClientSecret
                                    ? "Hide client secret"
                                    : "Show client secret"
                                }
                              >
                                {showUpworkClientSecret ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                            {upworkSecretConfigured ? (
                              <p className="text-[10px] text-muted-foreground">
                                A secret is already stored. Leave blank to keep
                                it, or enter a new one to rotate.
                              </p>
                            ) : null}
                            {upworkSecretConfigured &&
                            upworkClientId.trim() !==
                              upworkOAuthClientIdBaseline.trim() &&
                            upworkClientSecret.trim().length < 8 ? (
                              <p className="text-[10px] text-amber-700 dark:text-amber-500">
                                Changing the Client ID requires the matching
                                Client Secret (at least 8 characters) in the
                                same save.
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            onClick={() =>
                              void handleSaveUpworkAppCredentials()
                            }
                            disabled={upworkOAuthSaveDisabled}
                            className="gap-2"
                          >
                            {savingUpworkCreds ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            Save app credentials
                          </Button>
                          {upworkOAuthAppFullyConfigured &&
                          upworkEditingOAuthApp ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleCancelUpworkOAuthEdit()}
                              disabled={savingUpworkCreds}
                            >
                              Cancel
                            </Button>
                          ) : null}
                          {canRemoveUpworkCredentials ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setRemoveUpworkCredsDialogOpen(true)
                              }
                              disabled={
                                savingUpworkCreds || removingUpworkCreds
                              }
                              className="ml-auto gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/60 dark:bg-transparent dark:hover:bg-destructive/15"
                            >
                              {removingUpworkCreds ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/70 px-4 py-3">
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            <CheckCircle className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                Upwork OAuth app is configured
                              </p>
                              {upworkClientIdPreview ? (
                                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                                  Client ID {upworkClientIdPreview}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={handleEditUpworkOAuthApp}
                              disabled={removingUpworkCreds}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setRemoveUpworkCredsDialogOpen(true)
                              }
                              disabled={removingUpworkCreds}
                              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/60 dark:bg-transparent dark:hover:bg-destructive/15"
                            >
                              {removingUpworkCreds ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              Remove
                            </Button>
                          </div>
                        </div>
                        {!upworkOauthReady && upworkOauthMessage ? (
                          <p className="text-xs text-destructive/90">
                            {upworkOauthMessage}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {!upworkConnected ? (
                    <div className="py-8 text-center">
                      <div className="size-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                        <Briefcase className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h4 className="font-semibold mb-2">
                        Connect Your Upwork Account
                      </h4>
                      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                        Authorize this app to read Upwork job data using the
                        credentials above.
                      </p>
                      <Button
                        onClick={() => void handleConnectUpwork()}
                        disabled={connectingUpwork || !upworkOauthReady}
                        className="gap-2"
                      >
                        {connectingUpwork ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                        Connect Upwork Account
                      </Button>
                      {!upworkOauthReady ? (
                        <p className="text-xs text-muted-foreground mt-3 max-w-md mx-auto">
                          Save valid Upwork app credentials above before
                          connecting.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 rounded-lg p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-green-800 dark:text-green-400">
                            Upwork account connected
                          </p>
                          {upworkConnectedAt && (
                            <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">
                              Connected{" "}
                              {new Date(upworkConnectedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDisconnectUpworkDialogOpen(true)}
                          disabled={disconnectingUpwork}
                          className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/60 dark:bg-transparent dark:hover:bg-destructive/15"
                        >
                          {disconnectingUpwork ? (
                            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                          ) : (
                            <XCircle className="h-3 w-3 mr-1.5" />
                          )}
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Upwork app registration guideline panel */}
              <aside className="bg-card rounded-xl shadow-sm border overflow-hidden">
                <div className="p-6 border-b">
                  <h3 className="font-bold text-lg">
                    Register your Upwork app
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create an app in the Upwork developer portal with the values
                    below, then paste its Client ID &amp; Secret on the left.
                  </p>
                </div>
                <div className="p-6 space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase">
                      Title
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 truncate rounded-md border bg-muted/40 px-3 py-2 text-sm">
                        ProposalLift
                      </code>
                      {renderCopyGuideButton("name", "ProposalLift")}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase">
                      Project type
                    </label>
                    <p className="text-sm">Web</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase">
                      Callback / Redirect URL
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 truncate rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
                        {upworkRedirectHint || UPWORK_CALLBACK_FALLBACK}
                      </code>
                      {renderCopyGuideButton(
                        "callback",
                        upworkRedirectHint || UPWORK_CALLBACK_FALLBACK,
                      )}
                    </div>
                    {!upworkRedirectHint ? (
                      <p className="text-[11px] text-muted-foreground">
                        Set{" "}
                        <code className="font-mono">UPWORK_REDIRECT_URI</code>{" "}
                        in your environment, then replace &lt;your-host&gt; with
                        your deployment domain.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-muted-foreground uppercase">
                        Project description
                      </label>
                      {renderCopyGuideButton(
                        "description",
                        UPWORK_APP_DESCRIPTION,
                      )}
                    </div>
                    <div className="max-h-56 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground">
                      {UPWORK_APP_DESCRIPTION}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase">
                      Expected API usage
                    </label>
                    <p className="text-sm">
                      <span className="font-medium">100 – 500</span> for light
                      use, or <span className="font-medium">500+</span> for
                      heavier use.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase">
                      Rotation period
                    </label>
                    <p className="text-sm">12 months</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase">
                      Permissions to enable (GraphQL)
                    </label>
                    <ul className="space-y-1.5">
                      {[
                        {
                          name: "Read marketplace Job Postings",
                          why: "powers the Job Feed search",
                        },
                        {
                          name: "Client Proposals - Read And Write Access",
                          why: "reads your submitted proposals",
                        },
                        {
                          name: "Freelancer Profile - Read And Write Access",
                          why: "reads your freelancer identity",
                        },
                        {
                          name: "Talent Profile - Read And Write Access public",
                          why: "imports your portfolio and personas",
                        },
                        {
                          name: "Common Entities - Read-Only Access",
                          why: "budget, location & organization fields",
                        },
                      ].map((perm) => (
                        <li key={perm.name} className="flex gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 shrink-0 mt-0.5 text-green-600 dark:text-green-400" />
                          <span>
                            <span className="font-medium">{perm.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {perm.why}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-muted-foreground">
                      Not required: Contract, Messaging, Offer, Payments,
                      TimeSheet, Transaction.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          ))}

        {activeTab === "knowledge-base" &&
          (loadingSettings ? (
            <div className="max-w-4xl space-y-6">
              <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
                <div className="p-6 border-b">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-lg" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-72" />
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-6">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-64 w-full" />
                  <div className="flex items-center justify-end gap-3">
                    <Skeleton className="h-10 w-16" />
                    <Skeleton className="h-10 w-40" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl space-y-6">
              <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
                <div className="p-6 border-b">
                  <div className="flex items-center gap-3">
                    <div className="size-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Knowledge Base</h3>
                      <p className="text-sm text-muted-foreground">
                        Context the AI uses to write authentic, specific
                        proposals
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-semibold">What to include:</p>
                    <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
                      <li>
                        Your core expertise, specializations, and tech stack
                      </li>
                      <li>
                        Case studies with specific metrics (e.g. &quot;Reduced
                        load time by 60% for an e-commerce client&quot;)
                      </li>
                      <li>
                        Notable clients, industries served, and years of
                        experience
                      </li>
                      <li>
                        Qualifications, certifications, and selling points
                      </li>
                      <li>
                        Processes and methodologies (Agile, CI/CD, code review)
                      </li>
                      <li>
                        Client testimonials or review excerpts from Upwork
                      </li>
                    </ul>
                    <p className="text-xs text-muted-foreground italic">
                      The AI references this to write proof points, metrics, and
                      authentic details instead of generic filler.
                    </p>
                  </div>

                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor="kb-content" className="text-sm font-bold">
                        Knowledge Base Content
                      </label>
                      <div className="flex items-center gap-2">
                        <KnowledgeBaseExamplesDialog
                          hasExistingText={knowledgeBase.trim().length > 0}
                          onSelect={handleApplyKbExample}
                          disabled={savingKb}
                        />
                        <KnowledgeBaseUploadDialog
                          hasExistingText={knowledgeBase.trim().length > 0}
                          onInsert={handleApplyKbUpload}
                          disabled={savingKb}
                        />
                      </div>
                    </div>
                    <Textarea
                      id="kb-content"
                      ref={kbTextareaRef}
                      value={knowledgeBase}
                      onChange={(e) => setKnowledgeBase(e.target.value)}
                      placeholder={`Example:\n\n## About me\nFull-stack developer specializing in React, Next.js, and Node.js. 150+ projects completed on Upwork with a 98% Job Success Score.\n\n## Key Results\n- Built a real-time dashboard for a FinTech startup processing 2M+ transactions/day\n- Reduced page load time from 4.8s to 1.2s for an e-commerce client, increasing conversions by 21%\n\n## Tech Stack\nReact, Next.js, TypeScript, Node.js, PostgreSQL, Redis, AWS, Docker, Tailwind CSS`}
                      rows={16}
                      // field-sizing-fixed overrides the base Textarea's
                      // field-sizing-content: without it, inserting a ~1,800
                      // character example grows the field to thousands of pixels
                      // and pushes Save off screen.
                      className="font-mono text-sm resize-y field-sizing-fixed max-h-[60vh] overflow-y-auto"
                    />
                    <div className="flex items-center justify-between mt-2 gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <p className="text-xs text-muted-foreground">
                          {knowledgeBase.length > 0
                            ? `${knowledgeBase.length.toLocaleString()} characters`
                            : "No content yet"}
                        </p>
                        {/* Amber and bordered rather than a muted text link:
                            this appears right after ~1,800 characters replaced
                            what the user had, so the way back must be obvious at
                            a glance. Static, not pulsing: a blinking undo would
                            nag rather than reassure. */}
                        {kbUndo && (
                          <button
                            type="button"
                            onClick={handleUndoKb}
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border px-3 py-1.5",
                              "text-xs font-semibold shadow-sm transition-colors",
                              "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
                              "dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40",
                            )}
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            {kbUndo.label}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Tip: use markdown headers (##) to organize sections
                      </p>
                    </div>
                  </div>

                </div>
              </div>

              <SettingsSaveBar
                isDirty={isDirtyKb}
                saving={savingKb}
                onSave={() => void handleSaveKnowledgeBase()}
                saveLabel="Save Knowledge Base"
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setClearKbDialogOpen(true)}
                  disabled={!knowledgeBase || savingKb}
                >
                  Clear
                </Button>
              </SettingsSaveBar>
            </div>
          ))}

        {activeTab === "webhooks" && (
          <div className="max-w-2xl space-y-4">
            {/*
              Required by the self-hosting story: pg_cron and pg_net run inside
              Supabase's infrastructure and can only reach a public address, so
              nothing schedules the notification job out of the box. Without this
              notice, a configured webhook that never fires reads as a bug.
            */}
            <div className="flex gap-3 rounded-xl border border-amber-200/90 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/25">
              <AlertTriangle
                className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-500 mt-0.5"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                  Job alerts need a scheduler before they fire
                </p>
                <p className="text-xs text-amber-900/85 dark:text-amber-200/80 mt-0.5">
                  Webhooks are delivered by a cron job that this app cannot
                  schedule for you. <code className="font-mono">pg_cron</code>{" "}
                  runs inside Supabase and can only reach a public URL, so it
                  will never reach an instance on localhost. Follow{" "}
                  <code className="font-mono">docs/cron.md</code> to schedule{" "}
                  <code className="font-mono">/api/cron/job-notifications</code>{" "}
                  with your own <code className="font-mono">CRON_SECRET</code>.
                  Until then you can save and test webhooks here, but nothing
                  fires on its own.
                </p>
              </div>
            </div>
            <WebhookSettings />
          </div>
        )}

        {activeTab === "security" && (
          <div className="max-w-2xl space-y-6">
            <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
              <div className="p-6 border-b flex items-center gap-3">
                <div className="size-10 bg-rose-100 dark:bg-rose-900/30 rounded-lg flex items-center justify-center">
                  <Lock className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Change Password</h3>
                  <p className="text-sm text-muted-foreground">
                    Update your account password to keep it secure
                  </p>
                </div>
              </div>

              <div className="p-6">
                {isGoogleUser ? (
                  <div className="text-center py-8">
                    <div className="size-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                      <SettingsIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h4 className="font-semibold mb-2">
                      Google Account Security
                    </h4>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      This account signs in with Google. Change your password in
                      your Google Account preferences.
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => void handleChangePassword(e)}
                    className="space-y-6"
                  >
                    {[
                      {
                        id: "currentPassword",
                        label: "Current Password",
                        value: currentPassword,
                        setValue: setCurrentPassword,
                        show: showCurrentPassword,
                        setShow: setShowCurrentPassword,
                        placeholder: "Enter current password",
                      },
                      {
                        id: "newPassword",
                        label: "New Password",
                        value: newPassword,
                        setValue: setNewPassword,
                        show: showNewPassword,
                        setShow: setShowNewPassword,
                        placeholder: "Enter new password (min. 6 chars)",
                      },
                      {
                        id: "confirmPassword",
                        label: "Confirm New Password",
                        value: confirmPassword,
                        setValue: setConfirmPassword,
                        show: showConfirmPasswordUI,
                        setShow: setShowConfirmPasswordUI,
                        placeholder: "Confirm new password",
                      },
                    ].map((field) => (
                      <div key={field.id} className="space-y-2">
                        <label
                          htmlFor={field.id}
                          className="text-sm font-bold text-muted-foreground uppercase"
                        >
                          {field.label}
                        </label>
                        <div className="relative">
                          <Input
                            id={field.id}
                            type={field.show ? "text" : "password"}
                            value={field.value}
                            onChange={(e) => field.setValue(e.target.value)}
                            placeholder={field.placeholder}
                            className="pr-10"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => field.setShow(!field.show)}
                            aria-label={
                              field.show
                                ? `Hide ${field.label.toLowerCase()}`
                                : `Show ${field.label.toLowerCase()}`
                            }
                            className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                          >
                            {field.show ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="pt-4 flex justify-end">
                      <Button
                        type="submit"
                        disabled={passwordSaving || !passwordFieldsFilled}
                        className="px-8 gap-2"
                      >
                        {passwordSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          "Change Password"
                        )}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Danger Zone */}
            <div className="overflow-hidden rounded-xl border border-destructive/20 bg-card shadow-sm">
              <div className="flex items-center gap-3 border-b border-destructive/10 bg-destructive/5 p-4">
                <div className="flex size-7 shrink-0 items-center justify-center rounded bg-destructive/10">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <h3 className="font-bold text-destructive">Danger Zone</h3>
                  <p className="text-xs text-muted-foreground">
                    Permanent and irreversible. Proceed with caution.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <p className="font-bold">Delete Account</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Deletes your account and all its data immediately. There is
                    no grace period and no way back.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  className="shrink-0"
                  onClick={() => setDeleteConfirmDialogOpen(true)}
                >
                  Delete Account
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clear knowledge base confirmation */}
      <AlertDialog
        open={keyToRemove !== null}
        onOpenChange={(open) => {
          if (!open && !removingKey) setKeyToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove your {keyToRemove === "anthropic" ? "Anthropic" : "OpenAI"}{" "}
              API key?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {keyToRemove === "anthropic"
                ? "Claude will no longer be available for generating. You can add a key back any time."
                : "Every AI feature stops working until you add a key back."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingKey}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // The dialog closes on its own click handler, which would
                // unmount the row mid-request and lose the result.
                e.preventDefault();
                void handleRemoveKey();
              }}
              disabled={removingKey}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {removingKey ? "Removing..." : "Remove key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearKbDialogOpen} onOpenChange={setClearKbDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear knowledge base?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all context from the knowledge base. The AI will no
              longer use this text in proposals until you add new content and
              save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              // text-white, not text-destructive-foreground: that token is never
              // declared in globals.css, so the class resolves to nothing and the
              // label inherits dark text on the red fill.
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void handleClearKnowledgeBase()}
            >
              Clear knowledge base
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disconnect Upwork account confirmation */}
      <AlertDialog
        open={disconnectUpworkDialogOpen}
        onOpenChange={(open) => {
          if (!disconnectingUpwork) setDisconnectUpworkDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Upwork account?</AlertDialogTitle>
            <AlertDialogDescription>
              Your app credentials are kept, so you can reconnect without
              re-entering them. Job feeds stop working until you do.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectingUpwork}>
              Cancel
            </AlertDialogCancel>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void handleDisconnectUpwork()}
              disabled={disconnectingUpwork}
            >
              {disconnectingUpwork && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Disconnect
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Upwork app credentials confirmation */}
      <AlertDialog
        open={removeUpworkCredsDialogOpen}
        onOpenChange={(open) => {
          if (!removingUpworkCreds) setRemoveUpworkCredsDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Upwork credentials?</AlertDialogTitle>
            <AlertDialogDescription>
              Your Client ID and Secret will be deleted and your Upwork account
              disconnected. Filters, personas, and proposals are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Access on Upwork is not revoked. Delete or rotate the app in your{" "}
            <a
              href="https://www.upwork.com/developer/keys/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:text-destructive"
            >
              developer portal
            </a>
            .
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingUpworkCreds}>
              Cancel
            </AlertDialogCancel>
            {/*
              `hover:bg-destructive` is required, not redundant: with no
              hover-modified background here, tailwind-merge keeps the default
              variant's `hover:bg-primary/90` and the button turns lime on hover.
              Brightness supplies the hover cue instead.
            */}
            <Button
              onClick={() => void handleRemoveUpworkAppCredentials()}
              disabled={removingUpworkCreds}
              className="bg-destructive text-white hover:bg-destructive hover:brightness-[1.03]"
            >
              {removingUpworkCreds && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Remove credentials
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete account confirmation */}
      <AlertDialog
        open={deleteConfirmDialogOpen}
        onOpenChange={(open) => {
          if (!deletingAccount) {
            setDeleteConfirmDialogOpen(open);
            if (!open) setDeleteConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This happens immediately and cannot be undone. There is no grace
              period and no backup.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
              <li>
                All proposals, portfolio projects, personas, and templates
              </li>
              <li>All saved filters, hooks, and webhooks</li>
              <li>Your Upwork connection and stored API keys</li>
            </ul>
            <div className="pt-1">
              <label htmlFor="delete-confirm" className="text-sm font-bold">
                Type{" "}
                <span className="font-mono text-destructive">
                  {user?.email ?? "your email"}
                </span>{" "}
                to confirm
              </label>
              <Input
                id="delete-confirm"
                className="mt-2"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={user?.email ?? "you@example.com"}
                autoComplete="off"
                disabled={deletingAccount}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deletingAccount}
              onClick={() => setDeleteConfirmText("")}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              className="bg-destructive text-white hover:bg-destructive hover:brightness-[1.03]"
              disabled={
                deletingAccount ||
                !user?.email ||
                deleteConfirmText.trim().toLowerCase() !==
                  user.email.toLowerCase()
              }
              onClick={() => void handleDeleteAccount()}
            >
              {deletingAccount && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete my account
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved knowledge base guard for client-side navigation. Leaving the
          site entirely is handled by the browser's own beforeunload prompt. */}
      <AlertDialog
        open={pendingNavigation !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNavigation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              Your knowledge base has changes that have not been saved. If you
              leave now those edits are lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Escape or an outside click also cancels, but only this button
                jumps to the tab, since that is the deliberate "take me to it"
                choice. */}
            <AlertDialogCancel onClick={handleStayOnPage}>
              Stay on this page
            </AlertDialogCancel>
            <Button variant="destructive" onClick={handleDiscardAndLeave}>
              Discard and leave
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SettingsPageContent />
    </Suspense>
  );
}
