import { describe, expect, it } from "vitest";
import { classifyDocumentFilename } from "./classify-document-filename";

describe("classifyDocumentFilename", () => {
  it("routes each supported extension to its parser", () => {
    expect(classifyDocumentFilename("deck.pdf")).toEqual({ kind: "pdf" });
    expect(classifyDocumentFilename("overview.docx")).toEqual({ kind: "docx" });
    expect(classifyDocumentFilename("notes.txt")).toEqual({ kind: "txt" });
    expect(classifyDocumentFilename("readme.md")).toEqual({ kind: "md" });
  });

  it("matches case insensitively", () => {
    // The older parse-file route uses endsWith(".pdf"), so Resume.PDF fails
    // there. It must not fail here.
    expect(classifyDocumentFilename("Resume.PDF")).toEqual({ kind: "pdf" });
    expect(classifyDocumentFilename("Company.DocX")).toEqual({ kind: "docx" });
    expect(classifyDocumentFilename("NOTES.TXT")).toEqual({ kind: "txt" });
    expect(classifyDocumentFilename("README.MD")).toEqual({ kind: "md" });
  });

  it("ignores surrounding whitespace", () => {
    expect(classifyDocumentFilename("  deck.pdf  ")).toEqual({ kind: "pdf" });
  });

  it("only considers the last extension", () => {
    expect(classifyDocumentFilename("deck.pdf.exe")).toEqual({
      kind: null,
      reason: "unsupported",
    });
    expect(classifyDocumentFilename("archive.tar.gz")).toEqual({
      kind: null,
      reason: "unsupported",
    });
    expect(classifyDocumentFilename("q3.report.pdf")).toEqual({ kind: "pdf" });
  });

  it("calls out legacy .doc separately", () => {
    // mammoth cannot read the binary .doc format at all, so this needs its own
    // message rather than the generic unsupported one.
    expect(classifyDocumentFilename("overview.doc")).toEqual({
      kind: null,
      reason: "legacy_doc",
    });
    expect(classifyDocumentFilename("Overview.DOC")).toEqual({
      kind: null,
      reason: "legacy_doc",
    });
  });

  it("rejects everything else as unsupported", () => {
    for (const name of [
      "portfolio.pages",
      "notes.rtf",
      "logo.png",
      "sheet.xlsx",
      "deck.key",
    ]) {
      expect(classifyDocumentFilename(name)).toEqual({
        kind: null,
        reason: "unsupported",
      });
    }
  });

  it("rejects names with no usable extension", () => {
    for (const name of ["", "   ", "README", ".pdf", "."]) {
      expect(classifyDocumentFilename(name)).toEqual({
        kind: null,
        reason: "unsupported",
      });
    }
  });

  it("handles a trailing dot", () => {
    expect(classifyDocumentFilename("deck.")).toEqual({
      kind: null,
      reason: "unsupported",
    });
  });
});
