import { extractText } from "unpdf";
import mammoth from "mammoth";
import type { DocumentKind } from "./classify-document-filename";

// unpdf's serverless PDF.js build calls Promise.withResolvers, native only on
// Node 22+. Production runs on node:20-alpine, so polyfill defensively; no-op on
// newer runtimes.
if (!Promise.withResolvers) {
  Promise.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

/**
 * Pulls plain text out of an already-classified document buffer.
 *
 * Kept apart from `classifyDocumentFilename` so the routing rules stay unit
 * testable without loading unpdf and mammoth into the test run.
 *
 * Returns whatever the parser produced, including an empty string. A scanned or
 * image-only PDF has no text layer and legitimately yields "", so deciding what
 * that means is the caller's job, not this function's.
 */
export async function extractDocumentText(
  kind: DocumentKind,
  buffer: Buffer,
): Promise<string> {
  switch (kind) {
    case "pdf": {
      // mergePages keeps the return type a string. Without it unpdf returns an
      // array of per-page strings and every downstream assumption breaks.
      const { text } = await extractText(new Uint8Array(buffer), {
        mergePages: true,
      });
      return text;
    }
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "txt":
    case "md":
      return buffer.toString("utf-8");
  }
}
