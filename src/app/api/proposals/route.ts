import type { ProposalTenant } from "@/lib/extension/membership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";


const PROPOSAL_STATUSES = ["draft", "sent", "won", "lost"] as const;
type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

const DEFAULT_LIMIT = 10;
// The CSV export asks for every match in one request; cap it so a huge org
// cannot turn that into an unbounded table scan.
const MAX_LIMIT = 1000;

const isProposalStatus = (value: string): value is ProposalStatus =>
  (PROPOSAL_STATUSES as readonly string[]).includes(value);

/**
 * Builds one `ilike` term for a PostgREST `.or()` filter.
 *
 * Two separate escapes have to compose here:
 *  1. LIKE wildcards (`%`, `_`, `\`) are escaped so a user searching for "50%"
 *     matches a literal percent instead of everything.
 *  2. The result is wrapped in double quotes and its `\` / `"` escaped, because
 *     an unquoted comma or parenthesis in the term would be parsed as `.or()`
 *     syntax and break the whole query.
 */
const ilikeTerm = (column: string, search: string): string => {
  const likeEscaped = search.replace(/[\\%_]/g, (c) => `\\${c}`);
  const quoted = likeEscaped.replace(/[\\"]/g, (c) => `\\${c}`);
  return `${column}.ilike."%${quoted}%"`;
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
      const search = searchParams.get("search")?.trim() ?? "";
      const status = searchParams.get("status")?.trim() ?? "";
      const page = Math.max(
        1,
        parseInt(searchParams.get("page") ?? "1", 10) || 1,
      );
      const limit = Math.min(
        MAX_LIMIT,
        Math.max(
          1,
          parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) ||
            DEFAULT_LIMIT,
        ),
      );

      const tenant: ProposalTenant = { userId: user.id };

      let query = supabase
        .from("proposals")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

              query = query
          .eq("user_id", tenant.userId);

      if (status && isProposalStatus(status)) {
        query = query.eq("status", status);
      }

      if (search) {
        query = query.or(
          [
            ilikeTerm("client_name", search),
            ilikeTerm("job_title", search),
          ].join(","),
        );
      }

      query = query.range((page - 1) * limit, page * limit - 1);

      const { data: proposals, error: fetchError, count } = await query;

      if (fetchError) {
        return NextResponse.json(
          { error: fetchError.message },
          { status: 500 },
        );
      }

      const totalCount = count ?? 0;
      const totalPages = Math.max(1, Math.ceil(totalCount / limit));

      return NextResponse.json({
        proposals: proposals ?? [],
        totalCount,
        totalPages,
        currentPage: page,
      });
    } catch (error) {
      console.error("GET /api/proposals:", error);
      return NextResponse.json(
        { error: "Failed to fetch proposals" },
        { status: 500 },
      );
    }
}
