import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * GET /api/proposals/[id]/prefill
 *
 * Returns prefill data for the proposal form (job_title, job_description, etc.).
 * Used for secure "Regenerate" flow when navigating to /proposals/new?proposalId=...
 * (avoids passing sensitive job data in URL params)
 */
export async function GET(request: NextRequest,
  { params }: { params: Promise<{ id: string }> },) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Proposal ID is required" },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: proposal, error } = await supabase
      .from("proposals")
      .select("job_title, job_description, client_name, job_url, template_id")
      .eq("id", id)
      .single();

    if (error || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      prefill: {
        jobTitle: proposal.job_title,
        jobDescription: proposal.job_description || "",
        clientName: proposal.client_name || "",
        jobUrl: proposal.job_url || "",
        templateId: proposal.template_id || "",
      },
    });
  } catch (err) {
    console.error("Proposal prefill fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch proposal prefill" },
      { status: 500 },
    );
  }

}
