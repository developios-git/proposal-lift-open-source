import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getOpenAIApiKeyForTenant } from "@/lib/ai/openai-api-key-for-tenant";
import { createSupabaseForApiRequest } from "@/lib/supabase/api-auth";
import type { ProposalTenant } from "@/lib/extension/membership";
import type { Database } from "@/types/database";
import {
  extractJsonObjectSpan,
  importProjectRowSchema,
  MAX_PROJECTS_PER_IMPORT,
} from "@/lib/portfolio/import-schema";
import { normalizeChatgptPortfolioImportText } from "@/lib/portfolio/normalize-chatgpt-portfolio-import";
import { parsePortfolioCsv } from "@/lib/portfolio/parse-portfolio-csv";
import { storeProjectEmbeddingForTenant } from "@/lib/portfolio/store-project-embedding";
import { slugify } from "@/lib/slugify";

const MAX_RAW_BYTES = 512 * 1024;

const AUTO_CATEGORY_COLORS = [
  "blue",
  "indigo",
  "green",
  "lime",
  "pink",
  "amber",
  "orange",
  "cyan",
  "emerald",
  "violet",
  "gray",
] as const;

type RowError = { index: number; message: string; field?: string };

function categoryRowsBySlug(
  supabase: SupabaseClient<Database>,
  tenant: ProposalTenant,
  slug: string,
) {
  return supabase
    .from("portfolio_categories")
    .select("id, name, slug, color")
    .eq("slug", slug)
    .eq("user_id", tenant.userId)
    .limit(1)
    .maybeSingle();
}

function insertCategoryPayload(
  tenant: ProposalTenant,
  fields: { name: string; slug: string; color: string | null },
) {
  return {
    user_id: tenant.userId,
    name: fields.name,
    slug: fields.slug,
    color: fields.color,
  };
}

function parseRootPayload(body: unknown):
  | { ok: true; projects: unknown[] }
  | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "Invalid request body" };
  }
  const b = body as Record<string, unknown>;
  const raw =
    typeof b.raw === "string"
      ? b.raw
      : typeof b.json === "string"
        ? b.json
        : null;

  if (raw !== null) {
    if (raw.length > MAX_RAW_BYTES) {
      return { ok: false, error: "JSON input is too large" };
    }
    const text = extractJsonObjectSpan(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "Invalid JSON format" };
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !("projects" in parsed) ||
      !Array.isArray((parsed as { projects: unknown }).projects)
    ) {
      return { ok: false, error: 'Expected an object with a "projects" array' };
    }
    return { ok: true, projects: (parsed as { projects: unknown[] }).projects };
  }

  if (Array.isArray(b.projects)) {
    return { ok: true, projects: b.projects };
  }

  return {
    ok: false,
    error:
      'Send { "chatgptResponse": "..." } from the dashboard paste, { "csv": "..." } for CSV import, or { "raw": "..." } / { "projects": [...] } for structured JSON.',
  };
}

function formatZodIssues(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join("; ") || "Validation failed";
}

function isValidHttpUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return "URL must use http:// or https://";
    }
    return null;
  } catch {
    return "Invalid URL";
  }
}

type ValidatedRow = z.output<typeof importProjectRowSchema>;

export async function POST(request: NextRequest) {
  try {
    const auth = await createSupabaseForApiRequest(request);
    if (auth.supabase === null) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { supabase, user } = auth;

    let bodyJson: unknown;
    try {
      bodyJson = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON format" }, { status: 400 });
    }

    const tenant: ProposalTenant = { userId: user.id };

    const chatgptPaste =
      typeof (bodyJson as { chatgptResponse?: unknown }).chatgptResponse ===
      "string"
        ? (bodyJson as { chatgptResponse: string }).chatgptResponse.trim()
        : "";

    const csvBody =
      typeof (bodyJson as { csv?: unknown }).csv === "string"
        ? (bodyJson as { csv: string }).csv.trim()
        : "";

    let rawProjects: unknown[];

    if (chatgptPaste.length > 0) {
      if (chatgptPaste.length > MAX_RAW_BYTES) {
        return NextResponse.json(
          { error: "Pasted text is too large" },
          { status: 400 },
        );
      }

      const apiKey = await getOpenAIApiKeyForTenant(supabase, tenant);
      if (!apiKey) {
        return NextResponse.json(
          {
            error: "Add your OpenAI API key in Settings to use this.",
            code: "missing_api_key",
          },
          { status: 400 },
        );
      }

      const normalized = await normalizeChatgptPortfolioImportText(
        chatgptPaste,
        apiKey,
      );
      if (!normalized.ok) {
        return NextResponse.json(
          { error: normalized.error },
          { status: 422 },
        );
      }
      rawProjects = normalized.projects;
    } else if (csvBody.length > 0) {
      if (csvBody.length > MAX_RAW_BYTES) {
        return NextResponse.json(
          { error: "CSV is too large" },
          { status: 400 },
        );
      }
      const parsedCsv = parsePortfolioCsv(csvBody);
      if (!parsedCsv.ok) {
        return NextResponse.json({ error: parsedCsv.error }, { status: 400 });
      }
      rawProjects = parsedCsv.projects;
    } else {
      const parsedRoot = parseRootPayload(bodyJson);
      if (!parsedRoot.ok) {
        return NextResponse.json(
          { error: parsedRoot.error },
          { status: 400 },
        );
      }
      rawProjects = parsedRoot.projects;
    }

    if (rawProjects.length === 0) {
      return NextResponse.json({ error: "No projects to import" }, { status: 400 });
    }
    if (rawProjects.length > MAX_PROJECTS_PER_IMPORT) {
      return NextResponse.json(
        { error: `At most ${MAX_PROJECTS_PER_IMPORT} projects per import` },
        { status: 400 },
      );
    }

    const errors: RowError[] = [];
    const valid: { index: number; data: ValidatedRow }[] = [];

    rawProjects.forEach((item, index) => {
      const result = importProjectRowSchema.safeParse(item);
      if (!result.success) {
        errors.push({
          index,
          message: formatZodIssues(result.error),
        });
        return;
      }
      const data = result.data;
      if (data.url) {
        const urlErr = isValidHttpUrl(data.url);
        if (urlErr) {
          errors.push({ index, message: urlErr, field: "url" });
          return;
        }
      }
      valid.push({ index, data });
    });

    if (valid.length === 0) {
      return NextResponse.json({
        added: 0,
        failed: errors.length,
        createdCategories: [],
        projects: [],
        errors,
        embeddingWarnings: [],
      });
    }

    /** slug → display name (first wins) */
    const slugToLabel = new Map<string, string>();
    for (const { data } of valid) {
      const label = (data.category?.trim() || "General").trim() || "General";
      const slug = slugify(label) || "general";
      if (!slugToLabel.has(slug)) {
        slugToLabel.set(slug, label);
      }
    }

    const { data: existingCats, error: catFetchErr } = await supabase
      .from("portfolio_categories")
      .select("id, name, slug, color")
      .eq("user_id", tenant.userId);

    if (catFetchErr) {
      console.error("[projects/import] categories fetch:", catFetchErr);
      return NextResponse.json(
        { error: "Failed to load portfolio categories" },
        { status: 500 },
      );
    }

    const bySlug = new Map(
      (existingCats ?? []).map((c) => [c.slug, c] as const),
    );

    const createdCategories: { slug: string; name: string }[] = [];
    let colorRot = 0;

    for (const [slug, name] of slugToLabel) {
      if (bySlug.has(slug)) continue;

      const color =
        AUTO_CATEGORY_COLORS[colorRot % AUTO_CATEGORY_COLORS.length] ?? "gray";
      colorRot += 1;

      const { data: inserted, error: insErr } = await supabase
        .from("portfolio_categories")
        .insert(
          insertCategoryPayload(tenant, {
            name,
            slug,
            color,
          }),
        )
        .select("id, name, slug, color")
        .maybeSingle();

      if (insErr?.code === "23505") {
        const { data: again } = await categoryRowsBySlug(
          supabase,
          tenant,
          slug,
        );
        if (again) {
          bySlug.set(slug, again);
        }
        continue;
      }

      if (insErr || !inserted) {
        console.error("[projects/import] category insert:", insErr);
        return NextResponse.json(
          { error: insErr?.message || "Failed to create category" },
          { status: 500 },
        );
      }

      bySlug.set(slug, inserted);
      createdCategories.push({ slug: inserted.slug, name: inserted.name });
    }

    const saved: { id: string; name: string }[] = [];
    const insertErrors: RowError[] = [];
    const embeddingWarnings: { projectId: string; message: string }[] = [];

    for (const { index, data } of valid) {
      const label = (data.category?.trim() || "General").trim() || "General";
      const categorySlug = slugify(label) || "general";

      const row = {
        name: data.name,
        url: data.url ?? null,
        category: categorySlug,
        description: data.description,
        technologies: data.technologies,
        image_url: data.imageUrl,
        is_featured: data.featured,
        upwork_portfolio_item_id: data.upworkPortfolioItemId ?? null,
        user_id: tenant.userId,
      };

      const { data: inserted, error: insProjectErr } = await supabase
        .from("projects")
        .insert([row])
        .select("id, name")
        .single();

      if (insProjectErr || !inserted) {
        insertErrors.push({
          index,
          message: insProjectErr?.message || "Failed to save project",
        });
        continue;
      }

      saved.push({ id: inserted.id, name: inserted.name });

      try {
        const emb = await storeProjectEmbeddingForTenant(
          supabase,
          tenant,
          inserted.id,
        );
        if (!emb.ok) {
          console.warn(
            "[projects/import] embedding:",
            inserted.id,
            emb.message,
          );
          embeddingWarnings.push({
            projectId: inserted.id,
            message: emb.message,
          });
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Embedding generation failed";
        console.warn("[projects/import] embedding exception:", e);
        embeddingWarnings.push({ projectId: inserted.id, message: msg });
      }
    }

    return NextResponse.json({
      added: saved.length,
      failed: errors.length + insertErrors.length,
      createdCategories,
      projects: saved,
      errors: [...errors, ...insertErrors].sort((a, b) => a.index - b.index),
      embeddingWarnings,
    });
  } catch (error) {
    console.error("[projects/import]", error);
    const message =
      error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

}
