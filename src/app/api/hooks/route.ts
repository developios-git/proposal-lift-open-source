import { createHookSchema } from "@/lib/hooks/hook-schema";
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawSearch = searchParams.get("search")?.trim() ?? "";
    const page = Math.max(
      1,
      parseInt(searchParams.get("page") ?? "1", 10) || 1,
    );
    const limit = Math.max(
      1,
      parseInt(searchParams.get("limit") ?? "10", 10) || 10,
    );

    const escapedSearch = rawSearch.replace(/[%_\\]/g, (c) => `\\${c}`);

    let query = supabase
      .from("hooks")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    query = query.eq("user_id", user.id);

    if (escapedSearch) {
      query = query.or(
        `title.ilike.%${escapedSearch}%,description.ilike.%${escapedSearch}%`,
      );
    }

    query = query.range((page - 1) * limit, page * limit - 1);

    const { data: hooks, error: fetchError, count } = await query;

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const totalCount = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return NextResponse.json({
      hooks: hooks ?? [],
      totalCount,
      totalPages,
      currentPage: page,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch hooks" },
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

    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const sanitizedBody = {
      title: typeof raw.title === "string" ? strip(raw.title) : raw.title,
      description: typeof raw.description === "string" ? strip(raw.description) : raw.description,
    };

    const parsed = createHookSchema.safeParse(sanitizedBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message ?? "Validation failed", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { title, description } = parsed.data;

    const { data: hook, error: insertError } = await supabase
      .from("hooks")
      .insert({ user_id: user.id, title, description })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ hook });
  } catch {
    return NextResponse.json(
      { error: "Failed to create hook" },
      { status: 500 },
    );
  }

}
