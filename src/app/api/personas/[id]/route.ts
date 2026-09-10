import { updatePersonaSchema } from "@/lib/personas/persona-schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import sanitizeHtml from "sanitize-html";

/**
 * Upstream carried a `getPersonaContext` / `canMutatePersona` pair: it loaded
 * the caller's organization membership and role, then decided whether a persona
 * belonged to that org (and whether the caller was a `viewer`) or to the caller
 * personally. All of it collapses into the `.eq("user_id", user.id)` predicate
 * on each query below, which is what makes another user's persona id a 404
 * rather than an edit. RLS enforces the same rule at the database.
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: persona, error: fetchError } = await supabase
      .from("personas")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!persona) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    return NextResponse.json({ persona });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch persona" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    };

    const parsed = updatePersonaSchema.safeParse(sanitizedBody);
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

    const { data: updated, error: updateError } = await supabase
      .from("personas")
      .update({
        updated_at: new Date().toISOString(),
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
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    return NextResponse.json({ persona: updated });
  } catch {
    return NextResponse.json(
      { error: "Failed to update persona" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: deleted, error: deleteError } = await supabase
      .from("personas")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
    if (!deleted) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete persona" },
      { status: 500 },
    );
  }
}
