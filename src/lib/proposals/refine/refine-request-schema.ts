/**
 * Request contract for POST /api/proposals/refine-selection.
 *
 * Two kinds of limit live here, and conflating them is what once made a
 * 43-character selection fail with "Select a shorter passage":
 *
 *   - User-facing limits (selection, instruction) describe what a person may
 *     ask for. The toolbar enforces both before it will send, so a violation is
 *     a genuine client error and deserves a precise message.
 *   - Abuse ceilings (job posting, surrounding proposal text) exist only to
 *     bound the request body. Those fields are page scrapes of unbounded
 *     length, and buildRefineUserPrompt already truncates every one of them to
 *     its prompt budget. Enforcing that budget here instead rejects a request
 *     because a field is too long, when the very next step would trim that
 *     field to exactly that length.
 *
 * The prompt budget belongs to the prompt builder. This file only decides what
 * the endpoint is willing to receive.
 */

import { z } from "zod";
import {
  MAX_INSTRUCTION_LENGTH,
  MAX_SELECTION_CHARS,
} from "./build-refine-prompt";

/**
 * Ceiling for scraped or client-derived text. Deliberately generous: it bounds
 * the request body and nothing more, because what actually reaches the model is
 * the prompt builder's decision, not this schema's.
 */
export const MAX_UNTRUSTED_FIELD_CHARS = 50_000;

export const refineRequestSchema = z.object({
  selection: z.string().trim().min(1).max(MAX_SELECTION_CHARS),
  instruction: z.string().trim().min(1).max(MAX_INSTRUCTION_LENGTH),
  contextBefore: z.string().max(MAX_UNTRUSTED_FIELD_CHARS).optional(),
  contextAfter: z.string().max(MAX_UNTRUSTED_FIELD_CHARS).optional(),
  jobTitle: z.string().max(MAX_UNTRUSTED_FIELD_CHARS).optional(),
  jobDescription: z.string().max(MAX_UNTRUSTED_FIELD_CHARS).optional(),
  personaId: z.string().uuid().optional(),
});

export type RefineRequest = z.infer<typeof refineRequestSchema>;

/**
 * A 400 message naming the field that actually failed.
 *
 * The route used to return "Select a shorter passage and try again." for every
 * validation failure, so an oversized job description scraped from the page was
 * reported to the user as an oversized selection. Only the two user-facing
 * fields get specific copy; anything else is a payload problem the user cannot
 * act on by editing their selection.
 */
export function refineValidationMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  const field = issue?.path?.[0];
  const tooSmall = issue?.code === "too_small";

  if (field === "selection") {
    return tooSmall
      ? "Select some text to rewrite."
      : "Select a shorter passage and try again.";
  }

  if (field === "instruction") {
    return tooSmall
      ? "Describe what you want changed."
      : "Shorten your instruction and try again.";
  }

  return "Could not read that request. Please reselect the text and try again.";
}
