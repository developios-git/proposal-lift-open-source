/**
 * Getting Started checklist derivation.
 *
 * Pure so the ordering and the predicates can be exercised without a database;
 * `/api/getting-started/status` supplies the counts and flags.
 *
 * Two things differ from the commercial build:
 *
 * 1. **There is an `ai_key` step, and it sorts first.** Upstream had a platform
 *    OpenAI key, so a user's own key was optional and never appeared here. In
 *    this build `user_settings.openai_api_key` is the only key there is, and
 *    nothing that calls a model works without it.
 * 2. **Credentials come before connect, always.** Upstream branched on
 *    `isPaidPlan`: paid users could OAuth against a platform-owned Upwork app
 *    before registering their own, so connecting genuinely came first for them.
 *    There is no shared app here — you cannot connect an Upwork account until
 *    you have registered your own developer app — so there is only one possible
 *    order and no plan to branch on.
 *
 * The two Upwork steps stay separate, as upstream: `upwork_credentials` asks
 * whether a developer app was registered, `upwork_connect` whether an account
 * is linked. Collapsing them hides which half of a half-finished setup is
 * missing.
 */

export type GettingStartedStepId =
  | "ai_key"
  | "upwork_credentials"
  | "upwork_connect"
  | "filters"
  | "personas"
  | "knowledge_base"
  | "portfolio"
  | "templates"
  | "hooks";

export type GettingStartedStep = {
  id: GettingStartedStepId;
  label: string;
  done: boolean;
  /**
   * Set when another step has to be done before this one can be. Only
   * `portfolio` uses it: creating a project requires an OpenAI key, because
   * that is what generates the embedding a job is matched against. The UI
   * points at the key rather than letting the user walk into a blocked form.
   */
  blockedBy?: GettingStartedStepId;
};

export type GettingStartedInput = {
  /** True when `user_settings.openai_api_key` holds non-whitespace text. */
  hasAiKey: boolean;
  /** True when `upwork_access_token` is set. */
  upworkConnected: boolean;
  /** True when both `upwork_client_id` and `upwork_client_secret_encrypted` hold text. */
  hasPersonalUpworkCredentials: boolean;
  /** True when the user's `knowledge_base` column holds non-whitespace text. */
  hasKnowledgeBase: boolean;
  filterCount: number;
  personaCount: number;
  projectCount: number;
  templateCount: number;
  hookCount: number;
};

/** True only when both credential fields hold non-whitespace text. */
export function hasPersonalUpworkCredentials(
  clientId: string | null | undefined,
  clientSecretEncrypted: string | null | undefined,
): boolean {
  return Boolean(clientId?.trim()) && Boolean(clientSecretEncrypted?.trim());
}

/**
 * True only when the knowledge base holds non-whitespace text.
 *
 * Whitespace-only content reaches the model as nothing usable, so it must not
 * mark the step complete.
 */
export function hasKnowledgeBaseContent(
  knowledgeBase: string | null | undefined,
): boolean {
  return Boolean(knowledgeBase?.trim());
}

/**
 * True only when a real key is stored.
 *
 * Same whitespace rule as the knowledge base, and for the same reason: a column
 * holding `"  "` is a key the OpenAI client will reject, not a key.
 */
export function hasAiKeyContent(key: string | null | undefined): boolean {
  return Boolean(key?.trim());
}

export function buildGettingStartedSteps(
  input: GettingStartedInput,
): GettingStartedStep[] {
  return [
    {
      id: "ai_key",
      label: "Add your OpenAI API key",
      done: input.hasAiKey,
    },
    {
      id: "upwork_credentials",
      label: "Add Upwork API Client ID & Secret",
      done: input.hasPersonalUpworkCredentials,
    },
    {
      id: "upwork_connect",
      label: "Connect Upwork",
      done: input.upworkConnected,
    },
    { id: "filters", label: "Create Filters", done: input.filterCount > 0 },
    { id: "personas", label: "Create Personas", done: input.personaCount > 0 },
    // Sits before portfolio: the knowledge base is the "who you are" material,
    // and with no template selected it becomes the proposal structure itself.
    {
      id: "knowledge_base",
      label: "Add Knowledge Base",
      done: input.hasKnowledgeBase,
    },
    {
      id: "portfolio",
      label: "Add Portfolio",
      done: input.projectCount > 0,
      ...(input.hasAiKey ? {} : { blockedBy: "ai_key" as const }),
    },
    {
      id: "templates",
      label: "Create Templates",
      done: input.templateCount > 0,
    },
    { id: "hooks", label: "Set Up Hooks", done: input.hookCount > 0 },
  ];
}
