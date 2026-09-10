import { mergeCors } from "@/lib/extension/cors";
import { createSupabaseForApiRequest } from "@/lib/supabase/api-auth";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Who the extension is signed in as.
 *
 * Also the server-discovery probe. When the popup is given a URL it calls this
 * with no `Authorization` header and expects a **401 carrying a JSON body and
 * CORS headers** — that single response distinguishes "a ProposalLift server"
 * from "some other site", "unreachable", and "reachable but rejecting this
 * extension", which are four different things the user has to fix differently.
 *
 * So the 401 here is a successful answer, not a failure. Do not make it bare.
 */

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: mergeCors(request, {}),
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await createSupabaseForApiRequest(request);
    if (auth.supabase === null) {
      return NextResponse.json(
        { authenticated: false, error: auth.error },
        {
          status: auth.status,
          headers: mergeCors(request, { "Content-Type": "application/json" }),
        },
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        user: { id: auth.user.id, email: auth.user.email ?? null },
      },
      { headers: mergeCors(request, { "Content-Type": "application/json" }) },
    );
  } catch (e) {
    console.error("extension session", e);
    return NextResponse.json(
      { authenticated: false, error: "Internal server error" },
      {
        status: 500,
        headers: mergeCors(request, { "Content-Type": "application/json" }),
      },
    );
  }
}
