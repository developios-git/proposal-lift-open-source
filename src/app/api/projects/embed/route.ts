/**
 * POST /api/projects/embed
 *
 * Generates a pgvector embedding for a single portfolio project and stores it
 * in `projects.embedding`.
 *
 * Called from the portfolio create / edit pages after a project is saved, and
 * by the backfill action on the portfolio list.
 *
 * A missing OpenAI key is NOT an error here in the "something broke" sense: the
 * project is saved and valid, it simply cannot be matched against jobs until a
 * key exists. It returns 409 with `code: "missing_key"` so the client can say
 * exactly that rather than showing a generic failure.
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseForApiRequest } from "@/lib/supabase/api-auth";
import { storeProjectEmbeddingForTenant } from "@/lib/portfolio/store-project-embedding";

export async function POST(request: NextRequest) {
  try {
    const auth = await createSupabaseForApiRequest(request);
    if (auth.supabase === null) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { supabase, user } = auth;

    const body = (await request.json()) as { projectId?: string };
    if (!body.projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 },
      );
    }

    const result = await storeProjectEmbeddingForTenant(
      supabase,
      { userId: user.id },
      body.projectId,
    );

    if (!result.ok) {
      const status =
        result.code === "not_found" ? 404 : result.code === "missing_key" ? 409 : 500;
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[embed] error:", error);
    return NextResponse.json(
      { error: "Failed to generate embedding" },
      { status: 500 },
    );
  }
}
