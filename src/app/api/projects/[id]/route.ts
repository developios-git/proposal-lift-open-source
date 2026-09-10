import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateProjectSchema } from "@/lib/portfolio/project-schema";
import { NextResponse, type NextRequest } from "next/server";
import sanitizeHtml from "sanitize-html";

const STRIP_ALL: sanitizeHtml.IOptions = { allowedTags: [], allowedAttributes: {} };
const HTML_TAG_REGEX = /<[^>]*>/g;

const strip = (val: string | null | undefined): string | null => {
  if (val == null) return null;
  // Layer 1: sanitize-html (parser-based) — handles nested/malformed HTML and script content
  // Layer 2: regex — catches any remaining <...> patterns that slip through
  const cleaned = sanitizeHtml(val, STRIP_ALL).replace(HTML_TAG_REGEX, "").trim();
  return cleaned || null;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;

    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Sanitize BEFORE Zod so Zod validates the clean value.
    // Required fields coerce null → "" so Zod min(1) catches HTML-only inputs.
    const sanitizedBody = {
      name: strip(typeof body.name === "string" ? body.name : "") ?? "",
      url: typeof body.url === "string" ? strip(body.url) : body.url,
      category: strip(typeof body.category === "string" ? body.category : "") ?? "",
      client_name: typeof body.client_name === "string" ? strip(body.client_name) : body.client_name,
      description: typeof body.description === "string" ? strip(body.description) : body.description,
      technologies: Array.isArray(body.technologies)
        ? (body.technologies as unknown[]).map((t) => (typeof t === "string" ? strip(t) : null)).filter(Boolean)
        : body.technologies,
      is_featured: body.is_featured,
    };

    const parsed = updateProjectSchema.safeParse(sanitizedBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message ?? "Validation failed", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const d = parsed.data;

    // `.eq("user_id", user.id)` is ownership enforcement, not just a filter: it
    // turns another user's project id into a 404 rather than a silent no-op.
    // RLS enforces the same rule at the database.
    const { data: saved, error: saveError } = await supabase
      .from("projects")
      .update({
        name: d.name,
        url: d.url ?? null,
        category: d.category,
        client_name: d.client_name ?? null,
        description: d.description ?? null,
        technologies: d.technologies,
        is_featured: d.is_featured,
      })
      .eq("id", projectId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }
    if (!saved) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
