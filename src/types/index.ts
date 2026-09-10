import type { Database } from "./database";

// Extract types from database schema
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Template = Database["public"]["Tables"]["templates"]["Row"];
export type Proposal = Database["public"]["Tables"]["proposals"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Hook = Database["public"]["Tables"]["hooks"]["Row"];
export type Persona = Database["public"]["Tables"]["personas"]["Row"];
export type UserSettings = Database["public"]["Tables"]["user_settings"]["Row"];

// Insert types
export type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
export type TemplateInsert =
  Database["public"]["Tables"]["templates"]["Insert"];
export type ProposalInsert =
  Database["public"]["Tables"]["proposals"]["Insert"];
export type HookInsert = Database["public"]["Tables"]["hooks"]["Insert"];
export type PersonaInsert = Database["public"]["Tables"]["personas"]["Insert"];

// Update types
export type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];
export type TemplateUpdate =
  Database["public"]["Tables"]["templates"]["Update"];
export type ProposalUpdate =
  Database["public"]["Tables"]["proposals"]["Update"];
export type HookUpdate = Database["public"]["Tables"]["hooks"]["Update"];
export type PersonaUpdate = Database["public"]["Tables"]["personas"]["Update"];

// Category types
export type ProjectCategory =
  | "wordpress"
  | "shopify"
  | "headless"
  | "webapp"
  | "webflow"
  | "other";
export type ProposalStatus = "draft" | "sent" | "won" | "lost";

// AI types
export type AIProvider = "openai" | "anthropic";

export interface GenerateProposalRequest {
  jobTitle: string;
  jobDescription: string;
  /** Single block from extension / imports; fills description (and placeholder title if needed). */
  jobDetails?: string;
  clientName?: string;
  experienceLevel?: string;
  budget?: number;
  duration?: number;
  skills?: string[];
  notes?: string;
  /** Alias for `notes` (extension / external clients). */
  customInstructions?: string;
  templateId?: string;
  selectedProjectIds?: string[];
  aiModel?: string;
  aiProvider?: AIProvider;
  tone?: string;
  length?: string;
  /** Proposal identity from personas. Always user-scoped in this build. */
  personaId?: string;
  attachedFilesContent?: string;
  hookType?: string;
  customHookInstruction?: string;
  /** When true, POST returns SSE (`text/event-stream`) with token deltas and a final `done` event. */
  stream?: boolean;
  /**
   * Unified screening mode (extension checkbox). When true with a non-empty
   * `screeningQuestions` array, prompts include screening instructions and the
   * model outputs `<screening>...</screening>` JSON after `<hook>` / `<body>`.
   */
  includeScreening?: boolean;
  /** Exact question strings from the apply page, DOM order. */
  screeningQuestions?: string[];
}

export interface GenerateProposalResponse {
  content: string;
  model: string;
  provider: AIProvider;
  wordCount: number;
}

/** POST /api/proposals/generate-hook */
export interface GenerateHookRequest {
  jobTitle: string;
  jobDescription: string;
  clientName?: string;
  tone?: string;
  aiModel?: string;
  aiProvider?: AIProvider;
  hookType?: string;
  customHookInstruction?: string;
  /** When true, returns SSE with deltas and a final `done` event. */
  stream?: boolean;
}

// Portfolio links from the document
export interface PortfolioLinks {
  wordpress: string[];
  shopify: string[];
  headless: string[];
  webapps: string[];
  webflow: string[];
  personal: string[];
  figma: string[];
}

// Technical expertise
export interface TechnicalExpertise {
  frontend: string[];
  backend: string[];
  cms: string[];
  tools: string[];
  ai: string[];
}

/**
 * Saved job filter.
 *
 * Mirrors `saved_job_filters`, which is owned by exactly one user via `user_id`
 * and isolated by RLS. The table has no `updated_at` column — do not add one
 * here without a migration.
 */
export interface SavedJobFilter {
  id: string;
  created_at: string;
  user_id: string;
  name: string;
  filters: FilterCriteria | Record<string, unknown>;
  is_default: boolean;
  notification_enabled: boolean;
  /** Persisted preference for periodic job refresh on the filter page */
  auto_refresh_jobs_enabled?: boolean;
  /** AI Job Qualify: free-text niche criteria used to judge individual jobs. */
  qualify_criteria?: string | null;
  /** AI Job Qualify: when false, badges are hidden and the qualify endpoint rejects. */
  qualify_enabled?: boolean;
  /** When false the filter is inert: hidden from the feed, its page redirects, no Upwork calls. */
  is_enabled?: boolean;
}

// Filter criteria JSONB structure
export interface FilterCriteria {
  keywords?: {
    terms: string[];
    /** Jobs containing any of these are removed after fetch (fields controlled by exclude_search_in) */
    exclude_terms?: string[];
    /** Where to evaluate exclude_terms — same literals as search_in; default all three */
    exclude_search_in?: string[];
    search_in: string[];
    exclude: boolean;
    highlight: boolean;
  };
  job_terms?: {
    hourly_rate: { enabled: boolean; from: number | null; to: number | null };
    fixed_price: { enabled: boolean; from: number | null; to: number | null };
    hide_without_budget: boolean;
    filter_by_lower_range: boolean;
    required_connects: { min: number | null; max: number | null };
    /**
     * Applicant count range (competition). Client-side only — Upwork's search
     * filter has no applicant field. `max` at 200 means "200+", i.e. no upper
     * bound. See lib/jobs/competition-level.
     */
    applicants: { min: number | null; max: number | null };
  };
  client_details?: {
    payment_verified: boolean;
    enterprise_client: boolean;
    total_spend_min: number;
    hires_min: number;
    rating_min: number;
    reviews_count_min: number;
    avg_hourly_rate_min: number;
    hire_rate_min: number;
    preferred_locations: string[];
    avoid_locations: string[];
    /** Canonical country names (see country-filter). Client-side only. */
    include_countries: string[];
    exclude_countries: string[];
    include_without_history: boolean;
  };
  freelancer_location?: {
    us_filter: "include" | "exclude" | "only";
    /** Replaced the former `uk_filter`; the UK is part of this region's country list. */
    europe_filter: "include" | "exclude" | "only";
    preferred_qualifications: string[];
    avoid_qualifications: string[];
    show_without_country_preference: boolean;
  };
  freelancer_qualifications?: {
    talent_type: string[];
    english_level: string[];
    job_success_score: string;
    preferred_languages: string[];
    avoid_languages: string[];
  };
  advanced_job_preferences?: {
    featured_project: boolean;
    experience_level: string[];
    project_length: string[];
    hours_per_week: string[];
    screening_questions: string;
  };
  sites_categories?: Record<string, unknown>;
  advanced_filters?: Record<string, unknown>;
}

export const DEFAULT_FILTER_CRITERIA: FilterCriteria = {
  keywords: {
    terms: [],
    exclude_terms: [],
    exclude_search_in: ["title", "description", "skills"],
    search_in: ["title", "description", "skills"],
    exclude: false,
    highlight: true,
  },
  job_terms: {
    hourly_rate: { enabled: false, from: null, to: null },
    fixed_price: { enabled: false, from: null, to: null },
    hide_without_budget: false,
    filter_by_lower_range: false,
    required_connects: { min: null, max: null },
    applicants: { min: 0, max: 200 },
  },
  client_details: {
    payment_verified: false,
    enterprise_client: false,
    total_spend_min: 0,
    hires_min: 0,
    rating_min: 0,
    reviews_count_min: 0,
    avg_hourly_rate_min: 0,
    hire_rate_min: 0,
    preferred_locations: [],
    avoid_locations: [],
    include_countries: [],
    exclude_countries: [],
    include_without_history: true,
  },
  freelancer_location: {
    us_filter: "include",
    europe_filter: "include",
    preferred_qualifications: [],
    avoid_qualifications: [],
    show_without_country_preference: false,
  },
  freelancer_qualifications: {
    talent_type: ["not_specified"],
    english_level: ["not_specified"],
    job_success_score: "any",
    preferred_languages: [],
    avoid_languages: [],
  },
  advanced_job_preferences: {
    featured_project: false,
    experience_level: [],
    project_length: [],
    hours_per_week: [],
    screening_questions: "any",
  },
  sites_categories: {},
  advanced_filters: {},
};
