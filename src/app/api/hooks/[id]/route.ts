import { updateHookSchema } from "@/lib/hooks/hook-schema";
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
export async function PATCH(request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
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
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const sanitizedBody = {
      ...(raw.title !== undefined && {
        title: typeof raw.title === "string" ? strip(raw.title) : raw.title,
      }),
      ...(raw.description !== undefined && {
        description: typeof raw.description === "string" ? strip(raw.description) : raw.description,
      }),
    };

    const parsed = updateHookSchema.safeParse(sanitizedBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message ?? "Validation failed", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const d = parsed.data;

    const updates = {
      updated_at: new Date().toISOString(),
      ...(d.title !== undefined && { title: d.title }),
      ...(d.description !== undefined && { description: d.description }),
    };

    let q = supabase
      .from("hooks")
      .update(updates)
      .eq("id", id);

    q = q.eq("user_id", user.id);

    const { data: hook, error: updateError } = await q.select().single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!hook) {
      return NextResponse.json({ error: "Hook not found" }, { status: 404 });
    }

    return NextResponse.json({ hook });
  } catch {
    return NextResponse.json(
      { error: "Failed to update hook" },
      { status: 500 },
    );
  }

}

export async function DELETE(_request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
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

    let q = supabase.from("hooks").delete().eq("id", id);

    q = q.eq("user_id", user.id);

    const { error: deleteError } = await q;

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete hook" },
      { status: 500 },
    );
  }

}
