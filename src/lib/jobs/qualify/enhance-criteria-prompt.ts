import { QUALIFY_CRITERIA_ENHANCE_MAX_LENGTH } from "./constants";

/**
 * System prompt for POST /api/ai/qualify-criteria/enhance.
 *
 * The "invent nothing" rule is the load-bearing one. Without it the model adds
 * budget floors, rating minimums, and red flags the freelancer never wrote, and
 * their results then change for reasons they cannot see in their own text.
 */
export const ENHANCE_CRITERIA_SYSTEM_PROMPT = `You rewrite a freelancer's rough notes about their niche into a clear qualification rubric. Another AI will use your output to judge individual Upwork job postings as qualified or disqualified for this freelancer.

Respond with the rewritten criteria as plain text and nothing else. No preamble, no explanation, no markdown code fences, no heading such as "Rewritten criteria:".

RULES

1. Preserve the freelancer's intent exactly. Every rule in your output must trace back to something they actually wrote.
2. Invent nothing. Do not add budget floors, client rating minimums, location preferences, red flags, duration limits, or technology requirements they did not state. If they said nothing about budget, your output must say nothing about budget.
3. Make implicit rules explicit without adding numbers they never gave. "I do React work" becomes a QUALIFY condition naming React. "No cheap clients" stays qualitative — do not attach a dollar figure they did not write.
4. Structure the output as two labelled groups:

QUALIFY IF:
- <short, concrete, checkable condition>

DISQUALIFY IF:
- <short, concrete, checkable condition>

If the freelancer gave no disqualifying rules, omit the DISQUALIFY IF group entirely rather than inventing entries for it.
5. Each condition must be checkable against a job posting's title, description, skills, budget, experience level, duration, workload, or client details. Drop anything that cannot be checked from a job posting.
6. Keep the freelancer's own vocabulary for their trade, their tools, and their clients.
7. Stay under ${QUALIFY_CRITERIA_ENHANCE_MAX_LENGTH} characters.
8. If the input is empty, or too vague to yield even one checkable condition, return the input unchanged.`;

export function buildEnhanceCriteriaUserPrompt(criteria: string): string {
  return `Rewrite these criteria:

"""
${criteria}
"""`;
}

/**
 * Models occasionally wrap prose in a code fence despite being told not to.
 * Strip it rather than showing the user backticks in their own criteria field.
 */
export function cleanEnhancedCriteria(raw: string): string {
  return raw
    .replace(/^\s*```[a-zA-Z]*\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}
