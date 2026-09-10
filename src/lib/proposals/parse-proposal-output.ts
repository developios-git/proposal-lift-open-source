/**
 * Normalizes model output and splits hook/body from XML tags or paragraphs.
 */

export function sanitizeProposalText(text: string): string {
  return text
    .replace(/[\u2014\u2013]/g, ",")
    .replace(/[•]/g, "")
    .replace(/^\s*[-*]\s+/gm, "");
}

export function parseProposalContent(content: string, templateOwnsHook = false): {
  hook: string;
  body: string;
  wordCount: number;
} {
  const sanitize = sanitizeProposalText;

  let extractedHook = "";
  let extractedBody = "";

  const hookMatch = content.match(/<hook>([\s\S]*?)<\/hook>/i);
  const bodyMatch = content.match(/<body>([\s\S]*?)<\/body>/i);

  if (hookMatch && bodyMatch) {
    extractedHook = sanitize(hookMatch[1].trim());
    extractedBody = sanitize(bodyMatch[1].trim());
  } else {
    const paragraphs = content
      .split("\n\n")
      .filter((p: string) => p.trim() !== "");
    if (paragraphs.length > 1) {
      extractedHook = sanitize(
        paragraphs[0].replace(/<\/?hook>/gi, "").trim(),
      );
      extractedBody = sanitize(
        paragraphs
          .slice(1)
          .join("\n\n")
          .replace(/<\/?body>/gi, "")
          .trim(),
      );
    } else {
      extractedHook = sanitize(
        content.replace(/<\/?(?:hook|body)>/gi, "").trim(),
      );
      extractedBody = "";
    }
  }

  const wordCount = String(extractedHook + " " + extractedBody)
    .split(/\s+/)
    .filter(Boolean).length;

  return { hook: extractedHook, body: extractedBody, wordCount };
}

/** Parses `<screening>[...]</screening>` JSON array (unified proposal + screening generation). */
export function parseScreeningContent(content: string): {
  question: string;
  answer: string;
}[] | null {
  const match = content.match(/<screening>([\s\S]*?)<\/screening>/i);
  if (!match) return null;
  let raw = match[1].trim();
  raw = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: { question: string; answer: string }[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const q = (row as { question?: unknown }).question;
      const a = (row as { answer?: unknown }).answer;
      if (typeof q !== "string" || typeof a !== "string") continue;
      out.push({ question: q, answer: a });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/**
 * Incrementally extracts hook/body from a partial model response so each section
 * can be shown in separate fields while streaming (before closing tags exist).
 */
export function extractStreamingProposalParts(full: string): {
  hook: string;
  body: string;
} {
  const hookOpen = /<hook>/i.exec(full);
  const bodyOpen = /<body>/i.exec(full);

  if (hookOpen || bodyOpen) {
    let hook = "";
    let body = "";
    if (hookOpen) {
      const start = hookOpen.index! + hookOpen[0].length;
      const after = full.slice(start);
      const hookClose = /<\/hook>/i.exec(after);
      const end = hookClose ? hookClose.index! : after.length;
      hook = after.slice(0, end);
    }
    if (bodyOpen) {
      const start = bodyOpen.index! + bodyOpen[0].length;
      const after = full.slice(start);
      const bodyClose = /<\/body>/i.exec(after);
      const end = bodyClose ? bodyClose.index! : after.length;
      body = after.slice(0, end);
    }
    return { hook, body };
  }

  const trimmed = full.trim();
  if (!trimmed) {
    return { hook: "", body: "" };
  }

  const paragraphs = trimmed
    .split("\n\n")
    .filter((p: string) => p.trim() !== "");
  if (paragraphs.length <= 1) {
    return {
      hook: trimmed.replace(/<\/?(?:hook|body)>/gi, ""),
      body: "",
    };
  }

  return {
    hook: paragraphs[0].replace(/<\/?hook>/gi, "").trim(),
    body: paragraphs
      .slice(1)
      .join("\n\n")
      .replace(/<\/?body>/gi, "")
      .trim(),
  };
}
