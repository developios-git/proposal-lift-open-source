import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOpenAIApiKeyForTenant } from "@/lib/ai/openai-api-key-for-tenant";
import { createProjectSchema } from "@/lib/portfolio/project-schema";
import { NextResponse, type NextRequest } from "next/server";
import sanitizeHtml from "sanitize-html";

const STRIP_ALL: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};
const HTML_TAG_REGEX = /<[^>]*>/g;

const strip = (val: string | null | undefined): string | null => {
  if (val == null) return null;
  // Layer 1: sanitize-html (parser-based) handles nested/malformed HTML and
  // script content. Layer 2: regex catches any remaining <...> that slips past.
  const cleaned = sanitizeHtml(val, STRIP_ALL)
    .replace(HTML_TAG_REGEX, "")
    .trim();
  return cleaned || null;
};

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { searchParams } = new URL(request.url);

    const rawSearch = searchParams.get("search")?.trim() ?? "";
    const category = searchParams.get("category")?.trim() ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.max(1, parseInt(searchParams.get("limit") ?? "9", 10) || 9);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const escapedSearch = rawSearch.replace(/[%_\\]/g, (c) => `\\${c}`);

    // Explicit columns, not `*`: `embedding` is a 1536-element vector that
    // serialises to ~20 KB per row and the client never reads it. Whether a
    // project HAS one is reported through `unembeddedIds` below.
    const PROJECT_COLUMNS =
      "id, name, url, category, client_name, description, technologies, image_url, is_featured, upwork_portfolio_item_id, created_at, updated_at, user_id";

    let query = supabase
      .from("projects")
      .select(PROJECT_COLUMNS, { count: "exact" })
      .eq("user_id", user.id)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false });

    if (escapedSearch) {
      query = query.or(
        `name.ilike.%${escapedSearch}%,client_name.ilike.%${escapedSearch}%,description.ilike.%${escapedSearch}%`,
      );
    }

    if (category) {
      query = query.eq("category", category);
    }

    query = query.range((page - 1) * limit, page * limit - 1);

    const { data: projects, error: projectsError, count } = await query;

    if (projectsError) {
      return NextResponse.json(
        { error: projectsError.message },
        { status: 500 },
      );
    }

    const totalCount = count ?? 0;

    const now = new Date();
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();

    const [
      { count: totalProjectsCount },
      { count: featuredCount },
      { count: thisMonthCount },
      { count: unembeddedCount },
    ] = await Promise.all([
      supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_featured", true),
      supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", monthStart),
      // New for this build. A project saves fine without an OpenAI key and sits
      // with a NULL embedding, silently excluded from job matching. The list
      // page uses this to say so and offer a backfill: that state must be
      // visible in the UI, never silent.
      supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("embedding", null),
    ]);

    // Just the ids, so the list can badge individual rows without every row
    // carrying its vector.
    const { data: unembeddedRows } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .is("embedding", null);

    return NextResponse.json({
      projects: projects ?? [],
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      currentPage: page,
      unembeddedIds: (unembeddedRows ?? []).map((r) => r.id),
      stats: {
        total: totalProjectsCount ?? 0,
        featured: featuredCount ?? 0,
        thisMonth: thisMonthCount ?? 0,
        unembedded: unembeddedCount ?? 0,
      },
    });
  } catch (error) {
    console.error("GET /api/projects:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // A project is only useful once it has an embedding: matching is what the
    // portfolio is for, and that runs on the user's own OpenAI key. Creating
    // one without a key produces a row that silently never reaches a proposal,
    // so the key is required up front rather than warned about afterwards.
    //
    // Checked here, not only in the UI: this route is reachable directly and by
    // the extension. `code` lets the client say which setup step is missing
    // instead of showing a generic failure.
    const apiKey = await getOpenAIApiKeyForTenant(supabase, {
      userId: user.id,
    });
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Add your OpenAI API key in Settings before adding portfolio projects. It generates the embedding that matches your work to a job.",
          code: "missing_key",
        },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    // Sanitize BEFORE Zod so Zod validates the clean value. Required fields
    // coerce null → "" so `min(1)` catches HTML-only inputs: e.g.
    // "<script>hello</script>" → strip → "" → rejected as "Project name is required".
    const sanitizedBody = {
      name: strip(typeof body.name === "string" ? body.name : "") ?? "",
      url: typeof body.url === "string" ? strip(body.url) : body.url,
      category:
        strip(typeof body.category === "string" ? body.category : "") ?? "",
      client_name:
        typeof body.client_name === "string"
          ? strip(body.client_name)
          : body.client_name,
      description:
        typeof body.description === "string"
          ? strip(body.description)
          : body.description,
      technologies: Array.isArray(body.technologies)
        ? (body.technologies as unknown[])
            .map((t) => (typeof t === "string" ? strip(t) : null))
            .filter(Boolean)
        : body.technologies,
      is_featured: body.is_featured,
    };

    const parsed = createProjectSchema.safeParse(sanitizedBody);
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

    // `user_id` is also set by the `projects_set_user_id` trigger from
    // `auth.uid()`; passing it explicitly keeps ownership visible at the call
    // site and makes the insert correct even if the trigger is ever dropped.
    const { data: savedProject, error: saveError } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name: d.name,
        url: d.url ?? null,
        category: d.category,
        client_name: d.client_name ?? null,
        description: d.description ?? null,
        technologies: d.technologies,
        is_featured: d.is_featured,
      })
      .select()
      .single();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    return NextResponse.json({ project: savedProject }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
