/**
 * Decides which parser a filename should be routed to, if any.
 *
 * Split out from the parsing itself so the branching is unit-testable without
 * pulling `unpdf` and `mammoth` into the test run.
 *
 * Two rules the older `/api/utils/parse-file` gets wrong and this does not:
 * matching is case insensitive, so `Resume.PDF` works; and legacy `.doc` is
 * called out separately, because mammoth genuinely cannot read it and the
 * generic "unsupported file" message reads as a bug to someone holding a Word
 * document.
 */
export type DocumentKind = "pdf" | "docx" | "txt" | "md";

export type DocumentClassification =
  | { kind: DocumentKind }
  | { kind: null; reason: "legacy_doc" | "unsupported" };

const BY_EXTENSION: Record<string, DocumentKind> = {
  pdf: "pdf",
  docx: "docx",
  txt: "txt",
  md: "md",
};

export function classifyDocumentFilename(
  name: string,
): DocumentClassification {
  const trimmed = name.trim().toLowerCase();
  const dot = trimmed.lastIndexOf(".");

  // No extension, or a leading-dot name like ".pdf" with nothing before it.
  if (dot <= 0) return { kind: null, reason: "unsupported" };

  // Only the last extension counts, so `deck.pdf.exe` is an executable and not
  // a PDF.
  const extension = trimmed.slice(dot + 1);

  const kind = BY_EXTENSION[extension];
  if (kind) return { kind };

  if (extension === "doc") return { kind: null, reason: "legacy_doc" };

  return { kind: null, reason: "unsupported" };
}
