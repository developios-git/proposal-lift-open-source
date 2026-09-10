import { NextResponse, type NextRequest } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import type { ProposalTenant } from "@/lib/extension/membership";
import {
  ensureValidAccessToken,
  UpworkTokenMissingError,
  UpworkTokenRefreshError,
} from "@/lib/upwork/refresh-token";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { resolveUpworkPersonaCandidates } from "@/lib/upwork/resolve-persona-candidates";
import {
  mapUpworkMemberToPersonaDraft,
  type UpworkPersonaDraft,
} from "@/lib/personas/map-upwork-member-to-persona";
import { classifyDraftForBulkImport } from "@/lib/personas/classify-bulk-import";
import {
  stripPersonaTags,
  stripPersonaText,
} from "@/lib/personas/sanitize-persona-text";
import { UpworkQuotaExceededError } from "@/lib/upwork/quota";
import type { UpworkQuotaContext } from "@/lib/upwork/quota";
import { checkRateLimit } from "@/lib/rate-limit/check";
import {
  getAgencyMembersUserRatelimit,
  getPersonaBulkImportUserRatelimit,
} from "@/lib/rate-limit/limiters";
import type { Ratelimit } from "@upstash/ratelimit";

/**
 * NOTE: "organization" in this file means an *Upwork* organization — an agency
 * whose staff roster is being read through `companySelector`. It is unrelated to
 * this app's tenancy, which is one user per row.
 */

export type AgencyMemberCandidate = {
  personId: string;
  /** Name for the picker row. Never empty: falls back to a generic label. */
  displayName: string;
  email: string | null;
  photoUrl: string | null;
  /** A persona already carries this upwork_person_id. */
  alreadyImported: boolean;
  /** Upwork returned a talent profile, so role, bio, and skills are filled. */
  enriched: boolean;
  /**
   * Bulk import would create a persona for this person. False when already
   * imported or when the draft cannot satisfy createPersonaSchema, so the
   * "Import all N" count matches exactly what POST will do.
   */
  importable: boolean;
  /** Human-readable gaps when importable is false because the draft is thin. */
  missingForImport: string[];
  draft: UpworkPersonaDraft;
};

/**
 * What the candidate list represents:
 * - `agency`: the connected user's Upwork agency roster
 * - `self`:   just the connected user, because no roster was obtainable
 * - `none`:   nothing importable, e.g. a client-only Upwork account
 */
export type AgencyMembersReason = "agency" | "self" | "none";

export type AgencyMembersResponse = {
  organization: { organizationId: string; title: string } | null;
  members: AgencyMemberCandidate[];
  /** Number of distinct people returned. Equals members.length. */
  memberCount: number;
  /** Upwork's staff totalCount, which counts ROWS, not people. */
  totalCount: number;
  /**
   * Upwork capped the roster at one page. Derived from raw row counts, not from
   * members.length, which is smaller whenever one person holds two staff rows
   * and would otherwise report a phantom truncation.
   */
  truncated: boolean;
  /** At least one member came back with a talent profile. */
  enrichmentAvailable: boolean;
  /**
   * An agency was found but Upwork refused its roster with `view_staff` denied,
   * so we fell back to `self`. Only Upwork agency owners and admins hold that
   * account permission; regular members do not.
   */
  agencyPermissionDenied: boolean;
  /** Name of the agency we could not list, when agencyPermissionDenied. */
  agencyName: string | null;
  reason: AgencyMembersReason;
};

export type BulkImportSkipped = {
  personId: string;
  displayName: string;
  /** `failed` means the insert itself errored, e.g. a race on the unique index. */
  reason: "duplicate" | "incomplete" | "failed";
  missing: string[];
};

export type BulkImportResponse = {
  createdCount: number;
  skippedCount: number;
  created: Array<{ personId: string; displayName: string }>;
  skipped: BulkImportSkipped[];
};

type ImportContext = {
  supabase: SupabaseClient<Database>;
  tenant: ProposalTenant;
  accessToken: string;
  quotaContext: UpworkQuotaContext;
};

/**
 * Auth, rate limit, and a valid Upwork token. Shared by GET (preview) and POST
 * (bulk import), which must gate identically: both surface Upwork data, and
 * POST also writes personas.
 *
 * Upstream also refused the `viewer` role here. There are no roles.
 */
async function resolveImportContext(
  limiter: Ratelimit | null,
): Promise<ImportContext | NextResponse> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocked = await checkRateLimit(limiter, user.id);
  if (blocked) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(blocked.retryAfterSec) } },
    );
  }

  const tenant: ProposalTenant = { userId: user.id };

  let accessToken: string;
  try {
    accessToken = await ensureValidAccessToken(
      createSupabaseServiceClient(),
      tenant,
    );
  } catch (err) {
    if (err instanceof UpworkTokenMissingError) {
      return NextResponse.json(
        {
          error: "not_connected",
          message:
            "Upwork account is not connected. Go to Settings, then Integrations, to connect.",
        },
        { status: 400 },
      );
    }
    if (err instanceof UpworkTokenRefreshError) {
      return NextResponse.json(
        {
          error: "token_refresh_failed",
          message: "Upwork token refresh failed. Please reconnect Upwork.",
        },
        { status: 503 },
      );
    }
    throw err;
  }

  return {
    supabase,
    tenant,
    accessToken,
    quotaContext: { userId: user.id },
  };
}

/**
 * Upwork personIds that already have a persona, for the "Already imported"
 * marker.
 */
async function loadImportedPersonIds(
  supabase: SupabaseClient<Database>,
  tenant: ProposalTenant,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("personas")
    .select("upwork_person_id")
    .eq("user_id", tenant.userId)
    .not("upwork_person_id", "is", null);

  return new Set(
    (data ?? [])
      .map((row) => row.upwork_person_id)
      .filter((id): id is string => Boolean(id)),
  );
}

const QUOTA_EXCEEDED_RESPONSE = () =>
  NextResponse.json(
    {
      error: "quota_exceeded",
      message:
        "Daily Upwork API limit reached. Please try again after the limit resets.",
    },
    { status: 429 },
  );

/**
 * GET /api/upwork/agency-members
 *
 * Preview the connected Upwork agency's member roster, or the connected user's
 * own profile, as persona prefill drafts. Read-only: nothing is written, and per
 * Upwork ToS no roster snapshot is stored. Costs up to 3 Upwork API calls, all
 * quota-tracked.
 */
export async function GET(request: NextRequest) {
  const ctx = await resolveImportContext(getAgencyMembersUserRatelimit());
  if (ctx instanceof NextResponse) return ctx;

  const orgIdParam =
    new URL(request.url).searchParams.get("organizationId") ?? undefined;

  try {
    const source = await resolveUpworkPersonaCandidates(ctx.accessToken, {
      quotaContext: ctx.quotaContext,
      organizationId: orgIdParam,
    });

    const importedIds = await loadImportedPersonIds(ctx.supabase, ctx.tenant);
    const now = new Date();

    const members: AgencyMemberCandidate[] = source.candidates.map(
      ({ member, profile }) => {
        const draft = mapUpworkMemberToPersonaDraft(member, profile, now);
        const classification = classifyDraftForBulkImport(draft, importedIds);
        return {
          personId: member.personId,
          displayName:
            draft.full_name ??
            (source.reason === "self"
              ? "Your Upwork profile"
              : "Unnamed Upwork member"),
          email: member.email,
          photoUrl: draft.avatar_url,
          alreadyImported: importedIds.has(member.personId),
          enriched: profile !== null,
          importable: classification.status === "ready",
          missingForImport:
            classification.status === "incomplete" ? classification.missing : [],
          draft,
        };
      },
    );

    const body: AgencyMembersResponse = {
      organization: source.organization,
      members,
      memberCount: members.length,
      totalCount: source.totalCount,
      truncated: source.totalCount > source.rowCount,
      enrichmentAvailable: members.some((m) => m.enriched),
      agencyPermissionDenied: source.agencyPermissionDenied,
      agencyName: source.agencyName,
      reason: source.reason,
    };

    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof UpworkQuotaExceededError) {
      return QUOTA_EXCEEDED_RESPONSE();
    }
    throw err;
  }
}

/**
 * POST /api/upwork/agency-members
 *
 * Creates a persona for every importable Upwork member in one call.
 *
 * Body: `{ personIds?: string[] }`. Omit to import everyone; pass a subset to
 * limit it. The DRAFT CONTENT is always re-derived server-side and never taken
 * from the request, so a client cannot inject arbitrary persona text or forge an
 * `upwork_person_id`.
 *
 * Partial success is the norm: each row is inserted independently so one bad
 * member cannot sink the batch, and every skip is reported with a reason.
 */
export async function POST(request: NextRequest) {
  const ctx = await resolveImportContext(getPersonaBulkImportUserRatelimit());
  if (ctx instanceof NextResponse) return ctx;

  const rawBody: unknown = await request.json().catch(() => ({}));
  const requestedIds =
    rawBody &&
    typeof rawBody === "object" &&
    Array.isArray((rawBody as { personIds?: unknown }).personIds)
      ? new Set(
          ((rawBody as { personIds: unknown[] }).personIds ?? [])
            .filter((id): id is string => typeof id === "string")
            .map((id) => id.trim())
            .filter(Boolean),
        )
      : null;

  const orgIdParam =
    new URL(request.url).searchParams.get("organizationId") ?? undefined;

  let source;
  try {
    source = await resolveUpworkPersonaCandidates(ctx.accessToken, {
      quotaContext: ctx.quotaContext,
      organizationId: orgIdParam,
    });
  } catch (err) {
    if (err instanceof UpworkQuotaExceededError) {
      return QUOTA_EXCEEDED_RESPONSE();
    }
    throw err;
  }

  const importedIds = await loadImportedPersonIds(ctx.supabase, ctx.tenant);
  const now = new Date();

  const created: BulkImportResponse["created"] = [];
  const skipped: BulkImportSkipped[] = [];

  for (const { member, profile } of source.candidates) {
    if (requestedIds && !requestedIds.has(member.personId)) continue;

    const draft = mapUpworkMemberToPersonaDraft(member, profile, now);
    const displayName = draft.full_name ?? "Unnamed Upwork member";
    const classification = classifyDraftForBulkImport(draft, importedIds);

    if (classification.status === "duplicate") {
      skipped.push({
        personId: member.personId,
        displayName,
        reason: "duplicate",
        missing: [],
      });
      continue;
    }

    if (classification.status === "incomplete") {
      skipped.push({
        personId: member.personId,
        displayName,
        reason: "incomplete",
        missing: classification.missing,
      });
      continue;
    }

    const d = classification.values;

    const { error: insertError } = await ctx.supabase.from("personas").insert({
      user_id: ctx.tenant.userId,
      full_name: stripPersonaText(d.full_name),
      avatar_url: stripPersonaText(d.avatar_url),
      bio: stripPersonaText(d.bio),
      role_title: stripPersonaText(d.role_title),
      location: stripPersonaText(d.location),
      timezone: stripPersonaText(d.timezone),
      years_of_experience: d.years_of_experience ?? null,
      skills: stripPersonaTags(d.skills),
      specializations: stripPersonaTags(d.specializations),
      certifications: stripPersonaTags(d.certifications),
      upwork_url: stripPersonaText(d.upwork_url),
      linkedin_url: null,
      website_url: null,
      github_url: null,
      upwork_person_id: d.upwork_person_id ?? null,
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      // 23505 = unique_violation on the (user_id, upwork_person_id) index.
      // Something imported this person between the pre-filter and this insert,
      // so the outcome the user wanted already holds. Report it as a duplicate,
      // not a failure.
      skipped.push({
        personId: member.personId,
        displayName,
        reason: insertError.code === "23505" ? "duplicate" : "failed",
        missing: [],
      });
      continue;
    }

    importedIds.add(member.personId);
    created.push({ personId: member.personId, displayName });
  }

  const body: BulkImportResponse = {
    createdCount: created.length,
    skippedCount: skipped.length,
    created,
    skipped,
  };

  return NextResponse.json(body);
}
