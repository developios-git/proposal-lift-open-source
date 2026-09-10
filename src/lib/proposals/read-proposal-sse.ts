/** One screening question and the answer generated for it. */
export type ProposalScreeningAnswer = {
  question: string;
  answer: string;
};

export type ProposalStreamDonePayload = {
  hook: string;
  body: string;
  content: string;
  model: string;
  provider: string;
  wordCount: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /**
   * Present only when the request set `includeScreening` with at least one
   * question; `null` when the model returned none. The route always emits the
   * field, so `undefined` here means the stream did not reach `done`.
   *
   * Only the Chrome extension asks for these — the web app has no screening UI —
   * but the reader carries them so there is one parser for the route's whole
   * contract rather than a second one in the extension.
   */
  screeningAnswers?: ProposalScreeningAnswer[] | null;
};

export type HookStreamDonePayload = {
  hook: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

/**
 * An SSE `error` event, rethrown so the caller can tell a setup step apart from
 * a genuine failure. Without this the code is lost at the `throw` and every
 * stream error collapses into one generic toast.
 */
export class ProposalStreamError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ProposalStreamError";
    this.code = code;
  }
}

type SsePayload = {
  type: string;
  text?: string;
  message?: string;
  code?: string;
  hook?: string;
  body?: string;
  content?: string;
  model?: string;
  provider?: string;
  wordCount?: number;
  usage?: ProposalStreamDonePayload["usage"];
  screeningAnswers?: ProposalScreeningAnswer[] | null;
  /** `/api/proposals/refine-selection` only — a hint shown beside the rewrite. */
  notice?: string;
};

/**
 * Shared SSE reader for `/api/proposals/generate` and `/api/proposals/generate-hook` (stream: true).
 */
export async function readSseStream<T>(
  response: Response,
  onDelta: (text: string) => void,
  mapDone: (payload: SsePayload) => T,
): Promise<T> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const processBlock = (block: string): T | null => {
    const line = block.trim();
    if (!line.startsWith("data: ")) {
      return null;
    }
    const payload = JSON.parse(line.slice(6)) as SsePayload;

    if (payload.type === "delta" && payload.text) {
      onDelta(payload.text);
    }
    if (payload.type === "error") {
      throw new ProposalStreamError(
        payload.message || "Stream failed",
        payload.code,
      );
    }
    if (payload.type === "done") {
      return mapDone(payload);
    }
    return null;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const block of parts) {
      const result = processBlock(block);
      if (result !== null) return result;
    }
  }

  const tail = buffer.trim();
  if (tail) {
    for (const block of tail.split("\n\n")) {
      if (!block.trim()) continue;
      const result = processBlock(block);
      if (result !== null) return result;
    }
  }

  throw new Error("Stream ended before completion");
}

/**
 * Consumes the SSE body from POST /api/proposals/generate with `{ stream: true }`.
 */
export async function readProposalGenerationStream(
  response: Response,
  onDelta: (text: string) => void,
): Promise<ProposalStreamDonePayload> {
  return readSseStream(response, onDelta, (payload) => ({
    hook: payload.hook ?? "",
    body: payload.body ?? "",
    content: payload.content ?? "",
    model: payload.model ?? "",
    provider: payload.provider ?? "",
    wordCount: payload.wordCount ?? 0,
    usage: payload.usage,
    screeningAnswers: payload.screeningAnswers ?? null,
  }));
}

/**
 * Consumes the SSE body from POST /api/proposals/generate-hook with `{ stream: true }`.
 */
export async function readHookGenerationStream(
  response: Response,
  onDelta: (text: string) => void,
): Promise<HookStreamDonePayload> {
  return readSseStream(response, onDelta, (payload) => ({
    hook: payload.hook ?? "",
    model: payload.model ?? "",
    provider: payload.provider ?? "",
    usage: payload.usage,
  }));
}
