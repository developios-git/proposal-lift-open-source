import { updateTemplateSchema } from "@/lib/templates/template-schema";
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

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
      const { id } = await params;
      const supabase = await createSupabaseServerClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { data: template, error } = await supabase
        .from("templates")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }

      return NextResponse.json({ template });
    } catch (error) {
      console.error("GET /api/templates/[id]:", error);
      return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
      const { id } = await params;
      const supabase = await createSupabaseServerClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Ownership check: another user's template id must 404, not update.
      const { data: existing } = await supabase
        .from("templates")
        .select("id")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!existing) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }

      const raw = await request.json().catch(() => null);
      if (!raw || typeof raw !== "object") {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
      }

      const body = raw as Record<string, unknown>;

      const sanitizedBody = {
        ...(body.name !== undefined && {
          name: typeof body.name === "string" ? strip(body.name) ?? "" : body.name,
        }),
        ...(body.category !== undefined && {
          category: typeof body.category === "string" ? body.category.trim() : body.category,
        }),
        ...(body.content !== undefined && {
          content: typeof body.content === "string" ? body.content.trim() : body.content,
        }),
        ...(body.description !== undefined && {
          description: typeof body.description === "string" ? strip(body.description) : body.description,
        }),
        ...(body.variables !== undefined && {
          variables: Array.isArray(body.variables) ? body.variables : [],
        }),
      };

      const parsed = updateTemplateSchema.safeParse(sanitizedBody);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        return NextResponse.json(
          { error: firstIssue?.message ?? "Validation failed", issues: parsed.error.issues },
          { status: 400 },
        );
      }

      const d = parsed.data;

      const { data: template, error: updateError } = await supabase
        .from("templates")
        .update({
          ...(d.name !== undefined && { name: d.name }),
          ...(d.category !== undefined && { category: d.category }),
          ...(d.content !== undefined && { content: d.content }),
          ...(d.description !== undefined && {
            description: d.description?.trim() ? d.description : null,
          }),
          ...(d.variables !== undefined && { variables: d.variables }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ template });
    } catch (error) {
      console.error("PATCH /api/templates/[id]:", error);
      return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
    }
}
