import { updateProfileSchema } from "@/lib/profile/profile-schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import sanitizeHtml from "sanitize-html";

/**
 * The signed-in user's own profile.
 *
 * Upstream both handlers accepted a `userId` query parameter so an admin could
 * read or edit a *teammate's* profile: GET verified the two shared an
 * organization, and PUT additionally required a pro or team plan and validated
 * against a stricter `teamProfileSchema`. None of that exists here — there are
 * no teammates — so the target is always `user.id` and the parameter is gone.
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

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!profile) {
      // `handle_new_user()` inserts this row on signup, so a miss means the
      // on_auth_user_created trigger never fired. Worth saying plainly: the
      // schema itself gives no hint when that trigger is missing.
      return NextResponse.json(
        {
          error:
            "Profile row not found. The on_auth_user_created trigger may be missing from your database.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("GET /api/profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
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
      years_of_experience: raw.years_of_experience,
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

    const parsed = updateProfileSchema.safeParse(sanitizedBody);
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

    const { data: profile, error } = await supabase
      .from("profiles")
      .update({
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
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("PUT /api/profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
