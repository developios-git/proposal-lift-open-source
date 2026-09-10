import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import type { ProposalTenant } from "@/lib/extension/membership";
import {
  ensureValidAccessToken,
  UpworkTokenMissingError,
  UpworkTokenRefreshError,
} from "@/lib/upwork/refresh-token";
import {
  fetchUpworkPortfolioItems,
  type UpworkPortfolioItem,
} from "@/lib/upwork/client";

async function resolveAuth() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "Unauthorized", status: 401 as const };
  }
  const tenant: ProposalTenant = { userId: user.id };
  return {
    supabase,
    user,
    tenant,
    serviceClient: createSupabaseServiceClient(),
  };
}

/**
 * GET /api/upwork/portfolio
 *
 * Preview the connected freelancer's Upwork portfolio items (no import).
 * Items already imported are filtered out and reported as a count, so the
 * dialog can say "3 already imported" rather than silently showing fewer.
 */
export async function GET() {
  const resolved = await resolveAuth();
  if ("error" in resolved) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const { supabase, tenant, serviceClient } = resolved;

  let accessToken: string;
  try {
    accessToken = await ensureValidAccessToken(serviceClient, tenant);
  } catch (err) {
    if (err instanceof UpworkTokenMissingError) {
      return NextResponse.json(
        {
          error: "not_connected",
          message:
            "Upwork account is not connected. Go to Settings → Integrations to connect.",
        },
        { status: 400 },
      );
    }
    if (err instanceof UpworkTokenRefreshError) {
      return NextResponse.json(
        {
          error: "token_refresh_failed",
          message: err.message,
        },
        { status: 503 },
      );
    }
    throw err;
  }

  const items = await fetchUpworkPortfolioItems(accessToken, {
    quotaContext: { userId: tenant.userId },
  });

  const { data: importedRows } = await supabase
    .from("projects")
    .select("upwork_portfolio_item_id")
    .eq("user_id", tenant.userId)
    .not("upwork_portfolio_item_id", "is", null);

  const importedIds = new Set(
    (importedRows ?? [])
      .map((r) => r.upwork_portfolio_item_id)
      .filter((id): id is string => Boolean(id)),
  );

  const filteredItems = items.filter((item) => !importedIds.has(item.id));

  return NextResponse.json({
    items: filteredItems,
    count: filteredItems.length,
    alreadyImportedCount: items.length - filteredItems.length,
  });
}

/**
 * POST /api/upwork/portfolio
 *
 * Import selected Upwork portfolio items. Delegates to /api/projects/import so
 * category creation, validation and embedding all follow one path — the shape
 * of the response is that route's.
 */
export async function POST(request: NextRequest) {
  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = bodyJson as { items?: unknown };

  const resolved = await resolveAuth();
  if ("error" in resolved) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "No items to import" }, { status: 400 });
  }

  const upworkItems = body.items as UpworkPortfolioItem[];

  const projects = upworkItems.map((item) => ({
    name: item.title,
    description: item.description ?? null,
    technologies: item.skills.filter(Boolean),
    category: "Upwork Portfolio",
    featured: false,
    upworkPortfolioItemId: item.id,
  }));

  const origin = new URL(request.url).origin;
  const importRes = await fetch(`${origin}/api/projects/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ projects }),
  });

  const importData: unknown = await importRes.json();
  return NextResponse.json(importData, { status: importRes.status });
}
