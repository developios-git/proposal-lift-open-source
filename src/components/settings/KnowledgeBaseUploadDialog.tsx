"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  FileText,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";
import {
  KNOWLEDGE_BASE_ACCEPTED_EXTENSIONS,
  KNOWLEDGE_BASE_UPLOAD_MAX_BYTES,
} from "@/lib/knowledge-base/constants";

export interface KnowledgeBaseUploadDialogProps {
  /** Drives the confirm button's wording; the text is appended either way. */
  hasExistingText: boolean;
  /** Called with the text to append and the source filename. Caller snapshots for undo. */
  onInsert: (text: string, filename: string) => void;
  disabled?: boolean;
}

interface ExtractedDocument {
  text: string;
  filename: string;
  characters: number;
  truncated: boolean;
}

type Status = "idle" | "parsing" | "preview" | "structuring";

const MAX_MB = Math.round(KNOWLEDGE_BASE_UPLOAD_MAX_BYTES / (1024 * 1024));
const ACCEPT = KNOWLEDGE_BASE_ACCEPTED_EXTENSIONS.join(",");
const INPUT_ID = "kb-upload-input";

/**
 * "Upload document" affordance for the Knowledge Base field: pick a file, read
 * the extracted text, optionally have it restructured, then append it.
 *
 * Styled from `KnowledgeBaseExamplesDialog` so the two entry points beside the
 * same label read as one feature. That includes the `flex flex-col` plus
 * `min-h-0` chain, which is not cosmetic: fixed viewport-height panes are what
 * pushed the footer out of the examples dialog's overflow-hidden box.
 *
 * The dialog never closes on failure. After a bad file the user's next action is
 * another file, and closing would make them reopen to get back to the picker.
 */
export function KnowledgeBaseUploadDialog({
  hasExistingText,
  onInsert,
  disabled = false,
}: KnowledgeBaseUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [doc, setDoc] = useState<ExtractedDocument | null>(null);
  const [structured, setStructured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = status === "parsing" || status === "structuring";
  // Structuring happens with the preview still on screen; swapping back to the
  // picker mid-call would look like the upload had been thrown away.
  const showPreview =
    doc !== null && (status === "preview" || status === "structuring");

  function reset() {
    setStatus("idle");
    setDoc(null);
    setStructured(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    // Reopening should start from the picker, not from an abandoned preview.
    if (next) reset();
    setOpen(next);
  }

  async function handleFileSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    // Lets the same file be picked again after an error.
    event.target.value = "";
    if (!file) return;

    setError(null);

    // Checked here as well as on the server, so an oversized file fails
    // instantly instead of after a multi-megabyte round trip.
    if (file.size > KNOWLEDGE_BASE_UPLOAD_MAX_BYTES) {
      setError(`That file is over ${MAX_MB} MB. Upload a smaller one.`);
      return;
    }

    setStatus("parsing");
    try {
      const body = new FormData();
      body.append("file", file);

      const res = await apiFetch("/api/knowledge-base/import", {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not read that file. Try a different export.",
        );
        setStatus("idle");
        return;
      }

      setDoc({
        text: data.text,
        filename: data.filename,
        characters: data.characters,
        truncated: Boolean(data.truncated),
      });
      setStructured(false);
      setStatus("preview");
    } catch {
      setError("Could not upload that file. Check your connection.");
      setStatus("idle");
    }
  }

  async function handleStructure() {
    if (!doc) return;
    setError(null);
    setStatus("structuring");
    try {
      const res = await apiFetch("/api/knowledge-base/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: doc.text }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(
          typeof data.error === "string"
            ? data.error
            : "Failed to structure the document",
        );
        setStatus("preview");
        return;
      }

      setDoc({
        ...doc,
        text: data.text,
        characters: data.text.length,
        // The model wrote fresh text, so the import truncation no longer
        // describes what is on screen.
        truncated: false,
      });
      setStructured(true);
      setStatus("preview");
    } catch {
      toast.error("Failed to structure the document");
      setStatus("preview");
    }
  }

  function handleInsert() {
    if (!doc) return;
    onInsert(doc.text, doc.filename);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "h-9 gap-1.5 rounded-[10px] px-4 text-sm font-semibold",
            // Deliberately neutral. "Browse examples" beside this keeps the
            // emphasised treatment, because for an empty field a curated
            // example is the better first move and two competing buttons
            // cancel each other out.
            "border border-border bg-card text-foreground hover:bg-muted",
            "dark:border-border dark:bg-background dark:text-foreground dark:hover:bg-muted/50",
          )}
        >
          <Upload className="h-4 w-4" />
          Upload document
        </Button>
      </DialogTrigger>

      <DialogContent
        className={cn(
          "flex flex-col gap-0 overflow-hidden rounded-[16px] p-0 shadow-[0_24px_60px_-20px_rgba(11,15,10,0.35)]",
          "border border-border bg-background",
          "",
          "max-h-[88vh] sm:max-w-[760px]",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-5 px-7 py-8 sm:gap-6 sm:px-9 sm:py-9">
          <DialogHeader className="shrink-0 gap-2.5 text-left sm:text-left">
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1",
                "text-[11px] font-semibold uppercase tracking-[0.08em]",
                "border border-border bg-secondary text-muted-foreground",
                "dark:border-border dark:bg-muted dark:text-muted-foreground",
              )}
            >
              <Upload
                className="size-3.5 text-foreground"
                aria-hidden
              />
              From your files
            </span>
            <DialogTitle className="font-heading text-[26px] font-normal capitalize leading-[1.2] text-foreground">
              Upload a document
            </DialogTitle>
            <DialogDescription className="text-sm leading-[1.6] tracking-[-0.08px] text-muted-foreground">
              Pull the text out of a capability deck, company overview, or CV.
              Reading the file is free, and nothing is saved until you click Save
              Knowledge Base.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {!showPreview ? (
              <div className="flex min-h-0 flex-1 flex-col justify-center">
                <input
                  ref={inputRef}
                  id={INPUT_ID}
                  type="file"
                  accept={ACCEPT}
                  onChange={(e) => void handleFileSelected(e)}
                  disabled={busy}
                  className="hidden"
                />
                <label
                  htmlFor={INPUT_ID}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] px-6 py-10",
                    "border border-dashed border-border bg-card transition-colors hover:bg-muted",
                    "dark:border-border dark:bg-background dark:hover:bg-muted/50",
                    busy && "pointer-events-none opacity-60",
                  )}
                >
                  {status === "parsing" ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">
                        Reading your document
                      </span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">
                        {error ? "Choose another file" : "Choose a file"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        PDF, DOCX, TXT, or MD, up to {MAX_MB} MB
                      </span>
                    </>
                  )}
                </label>

                {error && (
                  <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-500">
                    <AlertTriangle
                      className="mt-px h-3.5 w-3.5 shrink-0"
                      aria-hidden
                    />
                    {error}
                  </p>
                )}
              </div>
            ) : (
              doc && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <FileText className="h-3.5 w-3.5" aria-hidden />
                      {doc.filename}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground/70">
                      {doc.characters.toLocaleString()} characters
                    </span>
                    {/* Without this the only way back to the picker is closing
                        and reopening the dialog. */}
                    <button
                      type="button"
                      onClick={reset}
                      disabled={busy}
                      className="text-[11px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground"
                    >
                      Choose another file
                    </button>
                  </div>
                  {/* Monospace to match the editor this lands in, so the
                      preview looks like the result. */}
                  <pre
                    className={cn(
                      "min-h-0 flex-1 overflow-y-auto rounded-[10px] p-3",
                      "font-mono text-xs leading-relaxed whitespace-pre-wrap",
                      "border border-border bg-card text-foreground",
                      "dark:border-border dark:bg-background dark:text-foreground",
                    )}
                  >
                    {doc.text}
                  </pre>
                </div>
              )
            )}

            {showPreview && doc?.truncated && (
              <p className="flex shrink-0 items-start gap-1.5 text-xs text-amber-700 dark:text-amber-500">
                <AlertTriangle
                  className="mt-px h-3.5 w-3.5 shrink-0"
                  aria-hidden
                />
                This document was longer than the knowledge base takes, so only
                the first part is shown. Add the rest by hand if you need it.
              </p>
            )}

            {showPreview && structured && (
              <p className="flex shrink-0 items-start gap-1.5 text-xs text-amber-700 dark:text-amber-500">
                <AlertTriangle
                  className="mt-px h-3.5 w-3.5 shrink-0"
                  aria-hidden
                />
                Reorganised by AI. Read it before saving, since every proposal
                will treat this as fact.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              onClick={() => setOpen(false)}
              className={cn(
                "h-12 rounded-[10px] px-6 font-sans text-sm font-semibold shadow-none transition-colors",
                "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
                "dark:border-border dark:bg-muted dark:text-foreground dark:hover:bg-muted/70",
              )}
            >
              Cancel
            </Button>

            {showPreview && (
              <>
                <Button
                  type="button"
                  onClick={() => void handleStructure()}
                  // Once structured, staying disabled is what stops the same
                  // document being paid for twice.
                  disabled={structured || busy}
                  className={cn(
                    "h-12 gap-1.5 rounded-[10px] px-6 font-sans text-sm font-semibold shadow-none transition-colors",
                    "border border-border bg-card text-foreground hover:bg-muted",
                    "dark:border-border dark:bg-background dark:text-foreground dark:hover:bg-muted/50",
                  )}
                >
                  {status === "structuring" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden />
                  )}
                  {status === "structuring"
                    ? "Structuring..."
                    : structured
                      ? "Structured"
                      : "Structure with AI"}
                </Button>
                <Button
                  type="button"
                  onClick={handleInsert}
                  disabled={busy}
                  className="h-12 rounded-[10px] bg-primary px-6 font-sans text-sm font-semibold text-primary-foreground shadow-none transition hover:brightness-[1.03]"
                >
                  {hasExistingText
                    ? "Add to my knowledge base"
                    : "Use this document"}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
