import type { ProposalTenant } from "@/lib/extension/membership";
import type { Database } from "@/types/database";

type CategoryUpdate =
  Database["public"]["Tables"]["portfolio_categories"]["Update"];
import { slugify } from "@/lib/slugify";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

async function requireUserAndTenant(supabase: Awaited<
  ReturnType<typeof createSupabaseServerClient>
>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { user: null, tenant: null };
  }

  const tenant: ProposalTenant = { userId: user.id };
  if ("error" in tenant) {
    return { user: null, tenant: null };
  }

  return { user, tenant };
}

function insertPayloadForTenant(
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

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const result = await requireUserAndTenant(supabase);

    if (!result.user || !result.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenant } = result;

    let query = supabase
      .from("portfolio_categories")
      .select("id, name, slug, color")
      .order("name", { ascending: true });
    query = query.eq("user_id", tenant.userId);

    const { data: categories, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json(
        { error: fetchError.message || "Failed to fetch categories" },
        { status: 500 },
      );
    }

    return NextResponse.json({ categories: categories || [] });
  } catch (err) {
    console.error("Portfolio categories GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const result = await requireUserAndTenant(supabase);

    if (!result.user || !result.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenant } = result;

    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const slug = typeof body?.slug === "string" ? body.slug.trim() : slugify(name);
    const color = typeof body?.color === "string" ? body.color.trim() : null;

    if (!name) {
      return NextResponse.json(
        { error: "Category name is required" },
        { status: 400 },
      );
    }

    const finalSlug = slug || slugify(name);
    if (!finalSlug) {
      return NextResponse.json(
        { error: "Invalid category name" },
        { status: 400 },
      );
    }

    const { data: category, error: insertError } = await supabase
      .from("portfolio_categories")
      .insert(
        insertPayloadForTenant(tenant, {
          name,
          slug: finalSlug,
          color: color || null,
        }),
      )
      .select("id, name, slug, color")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json(
          { error: "A category with this name or slug already exists" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: insertError.message || "Failed to create category" },
        { status: 500 },
      );
    }

    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    console.error("Portfolio categories POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const result = await requireUserAndTenant(supabase);

    if (!result.user || !result.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenant } = result;

    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id : "";
    const name = typeof body?.name === "string" ? body.name.trim() : undefined;
    const slug = typeof body?.slug === "string" ? body.slug.trim() : undefined;
    const color = typeof body?.color === "string" ? body.color.trim() : undefined;

    if (!id) {
      return NextResponse.json(
        { error: "Category ID is required" },
        { status: 400 },
      );
    }

    const updates: CategoryUpdate = {};
    if (name !== undefined) updates.name = name;
    if (slug !== undefined) updates.slug = slug;
    if (color !== undefined) updates.color = color;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    updates.updated_at = new Date().toISOString();

    const updateQuery = supabase
      .from("portfolio_categories")
      .update(updates)
      .eq("id", id)
      .eq("user_id", tenant.userId);

    const { data: category, error: updateError } = await updateQuery
      .select("id, name, slug, color")
      .single();

    if (updateError) {
      if (updateError.code === "23505") {
        return NextResponse.json(
          { error: "A category with this slug already exists" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: updateError.message || "Failed to update category" },
        { status: 500 },
      );
    }

    if (!category) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ category });
  } catch (err) {
    console.error("Portfolio categories PUT error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const result = await requireUserAndTenant(supabase);

    if (!result.user || !result.tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenant } = result;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Category ID is required" },
        { status: 400 },
      );
    }

    const fetchQuery = supabase
      .from("portfolio_categories")
      .select("slug")
      .eq("id", id)
      .eq("user_id", tenant.userId);

    const { data: cat, error: fetchErr } = await fetchQuery.single();

    if (fetchErr || !cat) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 },
      );
    }

    const countQuery = supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("category", cat.slug)
      .eq("user_id", tenant.userId);

    const { count } = await countQuery;

    if (count && count > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete: ${count} project(s) use this category. Reassign or remove them first.`,
        },
        { status: 400 },
      );
    }

    const deleteQuery = supabase
      .from("portfolio_categories")
      .delete()
      .eq("id", id)
      .eq("user_id", tenant.userId);

    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message || "Failed to delete category" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Portfolio categories DELETE error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

}
