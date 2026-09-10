import { createTemplateSchema } from "@/lib/templates/template-schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import sanitizeHtml from "sanitize-html";

const STRIP_ALL: sanitizeHtml.IOptions = { allowedTags: [], allowedAttributes: {} };
const HTML_TAG_REGEX = /<[^>]*>/g;

const strip = (val: string | null | undefined): string | null => {
  if (val == null) return null;
  const cleaned = sanitizeHtml(val, STRIP_ALL).replace(HTML_TAG_REGEX, "").trim();
  return cleaned || null;
};

export async function GET(request: NextRequest) {
    try {
      const supabase = await createSupabaseServerClient();
      const { searchParams } = new URL(request.url);

      const rawSearch = searchParams.get("search")?.trim() ?? "";
      const category = searchParams.get("category")?.trim() ?? "";
      const page = Math.max(
        1,
        parseInt(searchParams.get("page") ?? "1", 10) || 1,
      );
      const limit = Math.max(
        1,
        parseInt(searchParams.get("limit") ?? "6", 10) || 6,
      );

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const escapedSearch = rawSearch.replace(/[%_\\]/g, (c) => `\\${c}`);

      let query = supabase
        .from("templates")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (escapedSearch) {
        query = query.ilike("name", `%${escapedSearch}%`);
      }

      if (category) {
        query = query.eq("category", category);
      }

      query = query.range((page - 1) * limit, page * limit - 1);

      const { data: templates, error: fetchError, count } = await query;

      if (fetchError) {
        return NextResponse.json(
          { error: fetchError.message },
          { status: 500 },
        );
      }

      const totalCount = count ?? 0;
      const totalPages = Math.max(1, Math.ceil(totalCount / limit));

      return NextResponse.json({
        templates: templates ?? [],
        totalCount,
        totalPages,
        currentPage: page,
      });
    } catch {
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
}

export async function POST(request: NextRequest) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const raw = await request.json().catch(() => null);
      if (!raw || typeof raw !== "object") {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
      }

      const body = raw as Record<string, unknown>;

      const sanitizedBody = {
        name: typeof body.name === "string" ? strip(body.name) ?? "" : body.name,
        category: typeof body.category === "string" ? body.category.trim() : body.category,
        content: typeof body.content === "string" ? body.content.trim() : body.content,
        description: typeof body.description === "string" ? strip(body.description) : body.description,
        variables: Array.isArray(body.variables) ? body.variables : [],
      };

      const parsed = createTemplateSchema.safeParse(sanitizedBody);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        return NextResponse.json(
          { error: firstIssue?.message ?? "Validation failed", issues: parsed.error.issues },
          { status: 400 },
        );
      }

      const d = parsed.data;

      const insert = {
        user_id: user.id,
        name: d.name,
        category: d.category,
        content: d.content,
        // An empty box and a never-filled one are the same thing, so both land
        // as NULL rather than splitting the "no description" state in two.
        description: d.description?.trim() ? d.description : null,
        variables: d.variables,
        is_default: false,
      };

      const { data: template, error: insertError } = await supabase
        .from("templates")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(insert as any)
        .select()
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      return NextResponse.json({ template });
    } catch {
      return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
    }
}
