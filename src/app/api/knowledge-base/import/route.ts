import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyDocumentFilename } from "@/lib/documents/classify-document-filename";
import { extractDocumentText } from "@/lib/documents/extract-document-text";
import { tidyExtractedText } from "@/lib/knowledge-base/tidy-extracted-text";
import { truncateForKnowledgeBase } from "@/lib/knowledge-base/truncate-for-knowledge-base";
import {
  KNOWLEDGE_BASE_EXTRACT_MAX_CHARS,
  KNOWLEDGE_BASE_UPLOAD_MAX_BYTES,
} from "@/lib/knowledge-base/constants";
import { checkRateLimit } from "@/lib/rate-limit/check";
import { getKnowledgeBaseImportUserRatelimit } from "@/lib/rate-limit/limiters";

// mammoth and unpdf are Node-only.
export const runtime = "nodejs";

const MAX_MB = Math.round(KNOWLEDGE_BASE_UPLOAD_MAX_BYTES / (1024 * 1024));

/**
 * Extracts plain text from an uploaded document for the Settings knowledge base.
 *
 * Deliberately separate from `/api/utils/parse-file`, which serves the proposals
 * page and stays as it is. This one is reachable by every new user during setup,
 * so it carries the things that route does not: a size cap, a rate limit, case
 * insensitive extension matching, a distinct answer for scanned PDFs and legacy
 * .doc, and no logging of document contents.
 *
 * Nothing is stored. The bytes are parsed in memory and dropped; only the text
 * the user chooses to save reaches the database.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const blocked = await checkRateLimit(
      getKnowledgeBaseImportUserRatelimit(),
      user.id,
    );
    if (blocked) {
      return NextResponse.json(
        { error: "Too many uploads. Please wait a moment and try again." },
        {
          status: 429,
          headers: { "Retry-After": String(blocked.retryAfterSec) },
        },
      );
    }

    // Checked before formData(), which would otherwise buffer the entire body
    // into memory before we ever got to reject it.
    const declaredLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > KNOWLEDGE_BASE_UPLOAD_MAX_BYTES
    ) {
      return NextResponse.json(
        { error: `That file is over ${MAX_MB} MB. Upload a smaller one.` },
        { status: 413 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }
    // Content-Length covers the whole multipart envelope, which a client can
    // lie about, so re-check the part we actually read.
    if (file.size > KNOWLEDGE_BASE_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { error: `That file is over ${MAX_MB} MB. Upload a smaller one.` },
        { status: 413 },
      );
    }

    const classification = classifyDocumentFilename(file.name);
    if (classification.kind === null) {
      return NextResponse.json(
        {
          error:
            classification.reason === "legacy_doc"
              ? "Older .doc files can't be read. Save it as .docx or PDF and upload again."
              : "Upload a PDF, DOCX, TXT, or MD file.",
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractDocumentText(classification.kind, buffer);
    const tidied = tidyExtractedText(extracted);

    if (!tidied) {
      return NextResponse.json(
        {
          error:
            "No text found in this file. Scanned or image-only PDFs have no text layer, so try a text-based export.",
          code: "NO_TEXT_FOUND",
        },
        { status: 422 },
      );
    }

    const { text, truncated } = truncateForKnowledgeBase(
      tidied,
      KNOWLEDGE_BASE_EXTRACT_MAX_CHARS,
    );

    return NextResponse.json({
      text,
      filename: file.name,
      characters: text.length,
      truncated,
    });
  } catch (err) {
    // Error name only, never the message, and a fixed string in the response:
    // a parser exception can quote the document it choked on, and
    // the response body must not leak document content.
    console.error(
      "[knowledge-base/import] error:",
      err instanceof Error ? err.name : typeof err,
    );
    return NextResponse.json(
      { error: "Could not read that file. Try a different export." },
      { status: 500 },
    );
  }
}
