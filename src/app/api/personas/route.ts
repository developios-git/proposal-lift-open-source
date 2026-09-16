import { filterPersonasEligibleForProposals } from "@/lib/personas/persona-proposal-eligibility";
import { createPersonaSchema } from "@/lib/personas/persona-schema";
import { createSupabaseForApiRequest } from "@/lib/supabase/api-auth";
import { NextResponse, type NextRequest } from "next/server";
import sanitizeHtml from "sanitize-html";

/**
 * Upstream both handlers resolved a tenant and branched every query between
 * `organization_id` and `user_id`, and POST additionally refused the `viewer`
 * role. Rows are user-owned here, so the branch and the role check both go.
 *
 * `personas.created_by` is dropped from the schema too — with one owner it was
 * always equal to `user_id`.
 */

const STRIP_ALL: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};
const HTML_TAG_REGEX = /<[^>]*>/g;

const strip = (val: string | null | undefined): string | null => {
  if (val == null) return null;
  const cleaned = sanitizeHtml(val, STRIP_ALL)
    .replace(HTML_TAG_REGEX, "")
    .trim();
  return cleaned || null;
};

const stripTags = (arr: unknown[]): string[] =>
  arr
    .map((t) => (typeof t === "string" ? strip(t) : null))
    .filter((t): t is string => t !== null);

export async function GET(request: NextRequest) {
  try {
    const auth = await createSupabaseForApiRequest(request);
    if (auth.supabase === null) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const forProposalSelector =
      searchParams.get("forProposalSelector") === "true";
    const rawSearch = searchParams.get("search")?.trim() ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.max(
      1,
      parseInt(searchParams.get("limit") ?? "10", 10) || 10,
    );

    // The proposal selector wants every eligible persona, unpaginated.
    if (forProposalSelector) {
      const { data, error: fetchError } = await auth.supabase
        .from("personas")
        .select("*")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: true });

      if (fetchError) {
        return NextResponse.json(
          { error: fetchError.message },
          { status: 500 },
        );
      }

      const all = data || [];
      return NextResponse.json({
        personas: filterPersonasEligibleForProposals(all),
        totalPersonaCount: all.length,
      });
    }

    const escapedSearch = rawSearch.replace(/[%_\\]/g, (c) => `\\${c}`);

    // Newest first, so a persona the user just created or imported is at the
    // top rather than buried on the last page. `id` breaks ties: a bulk Upwork
    // import inserts many rows in quick succession, and without a stable
    // secondary sort, rows sharing a created_at could shift between pages.
    let query = auth.supabase
      .from("personas")
      .select("*", { count: "exact" })
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (escapedSearch) {
      query = query.or(
        `full_name.ilike.%${escapedSearch}%,role_title.ilike.%${escapedSearch}%,bio.ilike.%${escapedSearch}%`,
      );
    }

    query = query.range((page - 1) * limit, page * limit - 1);

    const { data: personas, error: fetchError, count } = await query;

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const totalCount = count ?? 0;

    return NextResponse.json({
      personas: personas ?? [],
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      currentPage: page,
    });
  } catch (error) {
    console.error("GET /api/personas:", error);
    return NextResponse.json(
      { error: "Failed to fetch personas" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await createSupabaseForApiRequest(request);
    if (auth.supabase === null) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const sanitizedBody = {
      full_name:
        typeof raw.full_name === "string" ? strip(raw.full_name) : raw.full_name,
      avatar_url:
        typeof raw.avatar_url === "string"
          ? strip(raw.avatar_url)
          : raw.avatar_url,
      bio: typeof raw.bio === "string" ? strip(raw.bio) : raw.bio,
      role_title:
        typeof raw.role_title === "string"
          ? strip(raw.role_title)
          : raw.role_title,
      location:
        typeof raw.location === "string" ? strip(raw.location) : raw.location,
      timezone:
        typeof raw.timezone === "string" ? strip(raw.timezone) : raw.timezone,
      years_of_experience:
        raw.years_of_experience === "" || raw.years_of_experience == null
          ? null
          : Number(raw.years_of_experience),
      skills: Array.isArray(raw.skills) ? stripTags(raw.skills) : [],
      specializations: Array.isArray(raw.specializations)
        ? stripTags(raw.specializations)
        : [],
      certifications: Array.isArray(raw.certifications)
        ? stripTags(raw.certifications)
        : [],
      upwork_url:
        typeof raw.upwork_url === "string"
          ? strip(raw.upwork_url)
          : raw.upwork_url,
      linkedin_url:
        typeof raw.linkedin_url === "string"
          ? strip(raw.linkedin_url)
          : raw.linkedin_url,
      website_url:
        typeof raw.website_url === "string"
          ? strip(raw.website_url)
          : raw.website_url,
      github_url:
        typeof raw.github_url === "string"
          ? strip(raw.github_url)
          : raw.github_url,
      upwork_person_id:
        typeof raw.upwork_person_id === "string"
          ? strip(raw.upwork_person_id)
          : raw.upwork_person_id,
    };

    const parsed = createPersonaSchema.safeParse(sanitizedBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: firstIssue?.message ?? "Validation failed",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const d = parsed.data;

    const { data: persona, error: insertError } = await auth.supabase
      .from("personas")
      .insert({
        user_id: auth.user.id,
        full_name: d.full_name ?? null,
        avatar_url: d.avatar_url ?? null,
        bio: d.bio ?? null,
        role_title: d.role_title ?? null,
        location: d.location ?? null,
        timezone: d.timezone ?? null,
        years_of_experience: d.years_of_experience ?? null,
        skills: d.skills,
        specializations: d.specializations,
        certifications: d.certifications,
        upwork_url: d.upwork_url ?? null,
        linkedin_url: d.linkedin_url ?? null,
        website_url: d.website_url ?? null,
        github_url: d.github_url ?? null,
        upwork_person_id: d.upwork_person_id ?? null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      // 23505 = unique_violation on the (user_id, upwork_person_id) index.
      if (insertError.code === "23505") {
        return NextResponse.json(
          {
            error:
              "This Upwork member already has a persona. Edit the existing persona instead.",
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ persona });
  } catch (error) {
    console.error("POST /api/personas:", error);
    return NextResponse.json(
      { error: "Failed to create persona" },
      { status: 500 },
    );
  }
}
