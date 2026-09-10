import { generateWithOpenAI, streamWithOpenAI } from "./openai";
import { generateWithAnthropic, streamWithAnthropic } from "./anthropic";
import {
  MissingApiKeyError,
  resolveAnthropicApiKey,
  resolveOpenAIApiKey,
} from "./keys";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
} from "./model-catalog";
/*
  Proposals used to default to temperature 0.7 and hooks to 0.8 — a nudge
  toward more varied openers. Effort is depth, not variance, so that
  distinction has no equivalent and one user-chosen level now covers both.
*/
import { normalizeEffort } from "./effort";
import type { AIGenerationResult } from "./types";
import type { UserSettings } from "@/types";

/** Fallback hook framework when Custom is selected without instructions (matches dashboard default). */
const DEFAULT_HOOK_FRAMEWORK_TYPE = "Relatable Pain Point";

// final system prompt
const DEFAULT_SYSTEM_PROMPT = `Upwork Proposal Writer - Optimized System Prompt

You are an expert Upwork proposal writer with proven success in winning high-value clients. Your proposals follow a systematic approach that consistently outperforms 95% of other freelancers.

CRITICAL FORMATTING RULES (Apply to every proposal, no exceptions):
1. NO em dashes (—) anywhere. Replace with a comma or period.
2. Use plain ASCII punctuation only. Avoid fancy bullets and special typography.
3. NO emojis.
4. Keep formatting simple. Prefer short paragraphs. If you include a "Relevant work" section, use 1 to 3 single line entries, not bullet lists.
5. Keep proposals SHORT. High-paying clients do not have time for long messages.
6. Total proposal length: 150 to 200 words maximum.
7. Before finalizing output, scan the entire proposal and confirm zero em dashes (—) appear anywhere.

Core Writing Rules:
- The generated proposal must not exceed 4000 characters (including spaces).
- Never use the em dash symbol (—). Replace all em dashes with commas (,). Do not attempt to indicate pauses or inflection with any symbols other than commas and full stops. Em dashes should never appear in your output for any reason.
- NO repetition of client requirements. Focus on solutions only.
- NO generic phrases like "Dear Sir/Madam" or "Please consider my proposal."
- Keep sentences short and easy to read. Add blank lines between paragraphs.
- Ask clarifying questions before writing. For example, before writing "I have done a similar project," ask if that is actually true. If yes, use it. If no, use a better alternative sentence.

7-Step Proposal Framework

1. Personalized Hook (First 2 lines)
Start with "Hello [Client Name]," then immediately hook them with ONE of these approaches:

Relevant project mention: "I recently completed a similar [project type] for [client] that [specific result]"
Problem awareness: "I can help you with [specific issue] and have a proven solution"
Direct value: "My portfolio of [relevant work] aligns perfectly with your needs"

2. Authority in 1 to 2 sentences
State experience level and core skills that match their needs:
"I am a [role] with X years specializing in [key skills] for companies like [notable clients]."

3. Solution-Focused Approach (3 to 4 sentences)
Outline your specific approach to solving their problem.
Show understanding of their business goals, not just requirements.
Focus on outcomes and benefits, not features.
Demonstrate industry knowledge.

4. Relevant Proof (up to 3 highly relevant examples)
Include ONLY highly relevant past projects from the RELEVANT PORTFOLIO PROJECTS section when provided.
If you include links, keep them in a tiny "Relevant work" section with single line entries (up to 3 entries).
Format each entry exactly like this:

Project Name: https://example.com. One sentence on what we built and why it is relevant.

Add a blank line after each entry.

Example:

Acme Pet Supply: https://www.acme-pet-supply.example. Built a custom Shopify theme focused on conversion improvements, increasing sales by 25%.

Northwind Outfitters: https://www.northwind-outfitters.example. Developed a high performance store with custom product builders and subscription management.

If a website is supplied in the persona profile above and the client is open to working with an agency, add it on its own line before the relevant work entries.

Only use projects from the RELEVANT PORTFOLIO PROJECTS section above. If that section is absent or contains nothing relevant, omit the relevant work section entirely rather than inventing entries.

5. Technical Skills (Job-specific)
For Custom Development: HTML, CSS, JavaScript, React, Node.js, [specific technologies mentioned in job]
For WordPress: WordPress, Elementor, ACF Pro, Custom Post Types, [avoid mentioning custom development unless requested]
For E-commerce: Shopify, conversion optimization, cart flows, [mention specific platforms they use]
For UX/UI: Figma, design systems, conversion optimization, user testing

6. Clear Next Steps (1 to 2 sentences)
State availability: "I am available 30+ hours per week"
Direct call to action: "Would you be available for a 15-minute call this week?"
Ask ONE engaging question about their specific needs.

7. Strategic PS
79% of people read the PS first. Use it to:
Create urgency or scarcity.
Add a personalized insight about their business.
Provide a secondary call to action.
Keep the PS to 1 sentence.

What NOT to Include:
"I have read your requirements and understand them perfectly."
"Although I do not have much experience..."
"I promise I will..."
Multiple questions in the main proposal.
More than 3 work examples.
Generic copy-paste content.
Long paragraphs or excessive detail.

Personalization Requirements:
Always use the client's first name (find in feedback history).
Google their business if mentioned.
Reference their specific industry or niche.
Show understanding of their business goals beyond the task.
Mention relevant experience without naming competitors directly.

Length Guidelines:
Total proposal: 150 to 200 words maximum.
Hook: 1 to 2 lines.
Each section: 1 to 4 sentences.
PS: 1 sentence.

Authority Building:
Use client testimonial snippets from your profile (cherry-pick best quotes).
Focus on outcomes, not just skills.
Include specific metrics when possible.
Show industry-specific experience.

Remember: This is about the CLIENT and their problems (90%), with you as the solution (10%). Every word should either demonstrate understanding of their needs or show how you solve their specific problem.

Hook Frameworks for Your Upwork Proposal

The first 2 sentences in the Upwork proposal are crucial to get the client's attention. You will be told which framework to use. Write the hook itself, never a label naming the framework.

1. Relatable Pain Point
Name the specific frustration or blocker implied by their job post, in their words, so they feel understood, then pivot straight into how you solve it.
"Hi John! Chasing down [specific bug/bottleneck from their post] eats up hours you do not have. I can get that fixed and get [the feature] running smoothly.

Let us go over this on a quick call."

2. Callout + Quick Win
Call out one concrete detail from their post to prove you read it closely, then immediately offer a fast, tangible win tied to it.
"Hi Mary! Noticed you specifically need [detail from their post]. I can turn around a first working version of that within [short timeframe] so you can see progress fast.

Let us have a quick meeting."

3. Mini Case Study
Briefly reference a directly comparable project you have done and the concrete result it got, framed as evidence you can do the same for them.
"Hi Adam! I recently built [comparable project] and it led to [concrete result]. Happy to apply the same approach here and jump in right away.

Let us have a chat today."

4. Custom
Follow the custom instruction provided for the opening instead of the frameworks above.

FINAL CHECK BEFORE OUTPUT:
Scan the entire proposal for em dashes (—) and replace every instance with a comma or period.
Confirm total word count is between 150 and 200 words.
Confirm no emojis are present.
Confirm no bullet points appear in the proposal body.
`;

// Template Mode system prompt — used when the user selected their own template.
// Keeps the quality/formatting rules but omits DEFAULT_SYSTEM_PROMPT's 7-step
// structure framework so the user's template is the single source of layout.
// This prevents the model from injecting a generic "I am a [role]..." authority
// paragraph that ignores the template's placeholder structure.
const TEMPLATE_MODE_SYSTEM_PROMPT = `Upwork Proposal Writer - Template Mode

You are an expert Upwork proposal writer with proven success in winning high-value clients.

CRITICAL FORMATTING RULES (Apply to every proposal, no exceptions):
1. NO em dashes (—) anywhere. Replace with a comma or period.
2. Use plain ASCII punctuation only. Avoid fancy bullets and special typography.
3. NO emojis.
4. Keep formatting simple. Prefer short paragraphs.
5. Keep proposals SHORT. High-paying clients do not have time for long messages.

Core Writing Rules:
- The generated proposal must not exceed 4000 characters (including spaces).
- Never use the em dash symbol (—). Replace all em dashes with commas (,). Do not attempt to indicate pauses or inflection with any symbols other than commas and full stops. Em dashes should never appear in your output for any reason.
- NO repetition of client requirements. Focus on solutions only.
- NO generic phrases like "Dear Sir/Madam" or "Please consider my proposal."
- Keep sentences short and easy to read. Add blank lines between paragraphs.

STRUCTURE SOURCE OF TRUTH:
A user-provided TEMPLATE STRUCTURE appears in the user message. That template defines the EXACT layout, sections, and order of the proposal. Follow it verbatim.
- Replace EVERY {{placeholder}} with specific, real content. Leave NO {{ }} tokens in the output.
- Do NOT impose the classic 7-step framework or any other structure of your own.
- Do NOT add a self-introduction or "I am a [role]..." authority paragraph unless the template explicitly contains one.
- Do NOT add extra sections that the template does not have.
- The knowledge base and persona are ONLY sources of facts and proof points, never structure or phrasing.

FINAL CHECK BEFORE OUTPUT:
Scan the entire proposal for em dashes (—) and replace every instance with a comma or period.
Confirm no emojis are present.
Confirm no {{ }} placeholders remain in the output.
Confirm the layout matches the user's template structure exactly.
`;

// hook only system prompt
const HOOK_SYSTEM_PROMPT = `You are an expert at writing Upwork proposal hooks. Your only job is to generate the opening 1–2 sentences that grab the client's attention and make them read the rest of the proposal.

## What makes a great hook
- Your FIRST sentence MUST reference something SPECIFIC from the client's job post (their exact words, a concrete requirement, a stated problem, or a desired outcome).
- Show you READ and UNDERSTOOD their job. Never use generic openers.
- The hook decides whether most clients reply or not. Be specific, not generic.
- Mirror the client's language when it fits naturally.
- Write like a peer offering help, not a subordinate begging for work.

## Critical rules (never break these)
- NEVER start with: "Dear Sir/Madam", "I am writing to...", "I came across your post...", "I saw your project..."
- NEVER open by talking about yourself first. Lead with their problem or goal.
- NO em dashes (—). Use commas or periods instead.
- NO emojis.
- Output ONLY the hook text. No labels, tags, quotes, or extra commentary.
- NEVER restate the framework's name (e.g. "Relatable Pain Point", "Callout + Quick Win") as a prefix, heading, or label in the output. Write the hook itself, not a description of the technique.
- Keep the hook to 1–2 lines. Target 120–150 characters. Concise and direct.

## Hook frameworks (you will be told which to use)
- Relatable Pain Point: Open by naming the specific frustration or blocker implied by their job post, in their words, so they feel understood, then pivot straight into how you solve it.
- Callout + Quick Win: Call out one concrete detail from their post to prove you read it closely, then immediately offer a fast, tangible win tied to that detail.
- Mini Case Study: Briefly reference a directly comparable project you've done and the concrete result it got, framed as evidence you can do the same for them.
- Custom: Follow the custom instruction provided.

Match the requested tone and hook strategy. Your output must be ONLY the hook, nothing else.

FINAL CHECK BEFORE OUTPUT:
Scan the hook for em dashes (—) and replace every instance with a comma or period.
Confirm the hook is between 120 and 150 characters.
Confirm no emojis are present.`;
interface GenerateParams {
  jobTitle: string;
  jobDescription: string;
  clientName?: string;
  experienceLevel?: string;
  budget?: number;
  duration?: number;
  skills?: string[];
  notes?: string;
  templateContent?: string;
  portfolioProjects?: {
    name: string;
    url: string | null;
    technologies: string[];
    description: string | null;
  }[];
  aiProvider: "openai" | "anthropic";
  aiModel?: string;
  tone?: string;
  length?: string;
  settings: UserSettings;
  knowledgeBase?: string;
  attachedFilesContent?: string;
  hookType?: string;
  customHookInstruction?: string;
  templateOwnsHook?: boolean;
  /** True when the user selected their own template; the template drives the
   * proposal structure and the built-in 7-step framework is skipped. */
  templateIsAuthority?: boolean;
  hookPlaceholderContext?: string;
  /** Unified screening (extension); see `docs/extension/screening-questions-handling-plan.md`. */
  includeScreening?: boolean;
  screeningQuestions?: string[];
}

const SCREENING_SYSTEM_ADDENDUM = `--- SCREENING ADDENDUM ---
The client also requires answers to separate screening questions on the Upwork apply form.
Follow the user prompt: after the proposal in <hook> and <body>, output a third block <screening> containing ONLY a JSON array of objects with keys "question" (exact string from the list) and "answer" (2-4 sentences).
Do not put screening prose inside <hook> or <body>. Keep answers specific and aligned with the agency knowledge and portfolio context.`;

function buildProposalSystemPrompt(
  settings: UserSettings,
  params: GenerateParams,
): string {
  let systemPrompt: string;
  if (settings.system_prompt) {
    // Org provided its own system prompt — respect it as-is.
    systemPrompt = settings.system_prompt;
  } else if (params.templateIsAuthority) {
    // Template Mode with the built-in prompt: use quality rules only so the
    // user's template drives the structure (no competing 7-step framework).
    systemPrompt = TEMPLATE_MODE_SYSTEM_PROMPT;
  } else {
    systemPrompt = DEFAULT_SYSTEM_PROMPT;
  }
  if (params.includeScreening && params.screeningQuestions?.length) {
    systemPrompt += `\n\n${SCREENING_SYSTEM_ADDENDUM}`;
  }
  systemPrompt += `\n\nREMINDER: The output must contain zero em dashes (—). Check every sentence before outputting.`;
  return systemPrompt;
}

function screeningMaxTokens(
  base: number | null | undefined,
  params: GenerateParams,
): number {
  const b = base ?? 2000;
  if (params.includeScreening && params.screeningQuestions?.length) {
    return Math.min(b + 1800, 12000);
  }
  return b;
}

function buildUserPrompt(params: GenerateParams): string {
  const parts: string[] = [];

  // Job context — this is what the AI needs to mirror and reference
  parts.push(`=== CLIENT'S JOB POST ===`);
  parts.push(`Title: ${params.jobTitle}`);
  parts.push(`Description:\n${params.jobDescription}`);

  if (params.attachedFilesContent) {
    parts.push(`\n--- ATTACHED FILES CONTENT ---`);
    parts.push(params.attachedFilesContent);
    parts.push(`--- END ATTACHED FILES ---`);
  }

  parts.push(`=== END JOB POST ===\n`);

  // Client intelligence
  if (params.clientName) {
    parts.push(`Client name: ${params.clientName}`);
  }
  if (params.experienceLevel) {
    parts.push(`Experience level requested: ${params.experienceLevel}`);
  }
  if (params.budget) {
    parts.push(`Budget: $${params.budget}`);
  }
  if (params.duration) {
    parts.push(`Estimated duration: ${params.duration} months`);
  }
  if (params.skills && params.skills.length > 0) {
    parts.push(`Required skills: ${params.skills.join(", ")}`);
  }

  // Agency knowledge base — expertise, case studies, testimonials, processes
  const kb =
    params.knowledgeBase ||
    ((params.settings as Record<string, unknown>).knowledge_base as
      | string
      | undefined);
  if (kb) {
    parts.push(`\n=== OUR AGENCY'S KNOWLEDGE BASE ===`);
    parts.push(
      `Use this information to write authentic, specific proof points and references:`,
    );
    parts.push(kb);
    parts.push(`=== END KNOWLEDGE BASE ===\n`);
  }

  // Portfolio projects — match retrieval supplies up to 3; instruct model to use up to 3
  if (params.portfolioProjects && params.portfolioProjects.length > 0) {
    parts.push(
      `\n=== RELEVANT PORTFOLIO PROJECTS (reference the most relevant examples, up to 3) ===`,
    );
    params.portfolioProjects.forEach((project) => {
      const desc = project.description
        ? project.description.slice(0, 200)
        : "No description";
      const urlPart = project.url?.trim()
        ? ` (${project.url})`
        : " (no live URL on file; reference by name and description only)";
      parts.push(`- "${project.name}"${urlPart}`);
      parts.push(`  ${desc}`);
      if (project.technologies.length > 0) {
        parts.push(`  Tech: ${project.technologies.join(", ")}`);
      }
    });
    parts.push(`=== END PORTFOLIO ===\n`);
  }

  // Upstream added an "Agency: <name> — <description>" line here from
  // `organization_settings`. Those columns do not exist in this build; the
  // persona and the knowledge base supply that context instead.

  // Template — structural guide
  if (params.templateContent) {
    if (params.templateIsAuthority) {
      // User selected their own template: it is the single source of layout.
      parts.push(
        `\n=== TEMPLATE STRUCTURE (THIS IS THE EXACT STRUCTURE — FOLLOW IT SECTION BY SECTION) ===`,
      );
      parts.push(params.templateContent);
      parts.push(
        `=== END TEMPLATE ===\nThis template is the single source of truth for the proposal layout. Keep the same sections in the same order, replace EVERY {{placeholder}} with specific content, and leave NO {{ }} tokens in the output. Do NOT add extra sections and do NOT add a self-introduction paragraph unless the template contains one. Use the knowledge base and persona ONLY as sources of facts and proof, never for structure or phrasing.\n`,
      );
    } else {
      parts.push(
        `\n=== TEMPLATE STRUCTURE (follow this layout, replace {{variables}}) ===`,
      );
      parts.push(params.templateContent);
      parts.push(`=== END TEMPLATE ===\n`);
    }
  }

  // Generation instructions
  parts.push(`\n--- GENERATION INSTRUCTIONS ---`);

  // Tone
  // The four the UI actually offers come first. `conversational`, `technical`
  // and `persuasive` are what the proposal form and the extension send; before
  // they were listed here they fell through to `params.tone` and reached the
  // model as a bare word ("Tone: technical") instead of a description. The
  // other three are kept because saved proposals and API callers use them.
  const toneGuide: Record<string, string> = {
    professional: "Professional and confident — like a seasoned expert",
    conversational:
      "Friendly and conversational — like a helpful colleague, warm but not casual",
    technical:
      "Highly technical — precise, specific, and unafraid of domain detail",
    persuasive:
      "Persuasive — lead with outcomes and make the case for hiring you",
    casual: "Friendly and conversational — like a helpful colleague",
    enthusiastic:
      "Energetic and passionate — show genuine excitement for the project",
    formal: "Formal and polished — corporate/enterprise tone",
  };
  parts.push(
    `Tone: ${toneGuide[params.tone || "professional"] || params.tone || "Professional and confident"}`,
  );

  // Length
  const lengthGuide: Record<string, string> = {
    short: "150-200 words (punchy, skimmable — best for simple jobs)",
    medium: "200-280 words (balanced depth — best for most jobs)",
    long: "300-320 words (detailed — for complex/high-budget jobs)",
  };
  parts.push(
    `Length: ${lengthGuide[params.length || "medium"] || "200-250 words"}`,
  );

  // Hook strategy (built-in type or custom instruction)
  if (params.hookType || params.customHookInstruction || params.templateOwnsHook) {
    const effectiveHookType =
      params.hookType === "Custom" && !params.customHookInstruction
        ? DEFAULT_HOOK_FRAMEWORK_TYPE
        : (params.hookType || DEFAULT_HOOK_FRAMEWORK_TYPE);
    const hookInstruction =
      params.hookType === "Custom" && params.customHookInstruction
        ? `Follow this custom instruction for the hook: ${params.customHookInstruction}`
        : `Use the "${effectiveHookType}" hook type framework for the opening.`;
    const hookPlaceholderFocus =
      params.templateOwnsHook && params.hookPlaceholderContext
        ? `\nAdditional hook focus: ${params.hookPlaceholderContext}`
        : "";
    parts.push(`\nHook strategy: ${hookInstruction}${hookPlaceholderFocus}`);
  }

  // Explicit "Hey [Client name]" instruction when client name is provided
  if (params.clientName) {
    parts.push(
      `\nHOOK FORMAT (required when client name is provided): The hook MUST start with "Hey ${params.clientName}," or "Hi ${params.clientName}," followed by your hook that references something specific from the job post. Use the exact client name given above.`,
    );
  }

  const screeningOn =
    Boolean(params.includeScreening) &&
    Array.isArray(params.screeningQuestions) &&
    params.screeningQuestions.length > 0;

  if (screeningOn) {
    parts.push(
      `\n=== CLIENT SCREENING QUESTIONS (put answers ONLY in the <screening> JSON block — not inside <body>) ===`,
    );
    params.screeningQuestions!.forEach((q, i) => {
      parts.push(`${i + 1}. ${q}`);
    });
    parts.push(`=== END SCREENING QUESTIONS ===\n`);
  }

  parts.push(
    `\n
IMPORTANT: When a client name is provided, start the hook with "Hey [Client name]," or "Hi [Client name]," then reference something SPECIFIC from the client's job post. Avoid generic openers like "Dear Sir/Madam" or "I am writing to..." — but DO use the personalized greeting when the client name is given.

Proposal Length Constraint: The generated proposal must not exceed 4000 characters (including spaces). Ensure the content is concise, impactful, and fully optimized within this limit.
`,
  );

  if (screeningOn) {
    parts.push(`
CRUCIAL: You MUST output your response in exactly THREE XML sections in this order, and nothing else:
1) <hook>...</hook> — first 1-2 lines of the cover letter.
2) <body>...</body> — the rest of the cover letter only (no screening answers here).${params.templateOwnsHook ? " The template contains a {{hook...}} placeholder — remove it entirely from the body (do NOT replace it with hook text)." : ""}
3) <screening>...</screening> — ONLY a JSON array, for example:
[{"question":"exact text from list above","answer":"2-4 sentences"},{"question":"...","answer":"..."}]
The "question" strings MUST match the screening list above in the same order. No markdown code fences inside <screening>; raw JSON only.
`);
  } else {
    if (params.templateOwnsHook) {
      parts.push(`
CRUCIAL: You MUST output your response exactly in two XML sections.
Put the hook (first 1-2 lines) inside <hook>...</hook> tags.
The template body contains a {{hook...}} placeholder — remove it entirely from the body (do NOT replace it with hook text). Put the rest of the template body inside <body>...</body> tags.
OUTPUT NOTHING ELSE outside of these tags.
`);
    } else {
      parts.push(`
CRUCIAL: You MUST output your response exactly in two XML sections.
Put the hook (first 1-2 lines) inside <hook>...</hook> tags.
Put the rest of the proposal inside <body>...</body> tags.
OUTPUT NOTHING ELSE outside of these tags.
`);
    }
  }

  if (params.notes) {
    parts.push(`\nAdditional context from the proposer: ${params.notes}`);
  }

  if (screeningOn) {
    parts.push(
      `\nNow write the proposal and screening JSON. Output only the three tag pairs — no Subject line, no extra commentary.`,
    );
  } else {
    parts.push(
      `\nNow write the proposal. Output ONLY the proposal text — no headers, no labels, no "Subject:", no markdown formatting. Just the raw proposal text ready to paste into Upwork.`,
    );
  }

  return parts.join("\n");
}

export async function generateProposal(
  params: GenerateParams,
): Promise<AIGenerationResult> {
  const { settings, aiProvider } = params;
  console.log("settings", settings);

  const systemPrompt = buildProposalSystemPrompt(settings, params);
  const userPrompt = buildUserPrompt(params);

  if (aiProvider === "anthropic") {
    const apiKey = resolveAnthropicApiKey(settings.anthropic_api_key);
    if (!apiKey) {
      throw new MissingApiKeyError(
        "anthropic",
        "Add your Anthropic API key in Settings to generate with this model.",
      );
    }

    const model =
      params.aiModel ||
      settings.anthropic_model ||
      DEFAULT_ANTHROPIC_MODEL;

    return generateWithAnthropic(apiKey, {
      systemPrompt,
      userPrompt,
      model,
      effort: normalizeEffort(settings.anthropic_effort),
      maxTokens: screeningMaxTokens(settings.anthropic_max_tokens, params),
    });
  }

  const apiKey = resolveOpenAIApiKey(settings.openai_api_key);
  if (!apiKey) {
    throw new MissingApiKeyError(
    "openai",
    "Add your OpenAI API key in Settings to generate.",
  );
  }

  const model = params.aiModel || settings.openai_model || DEFAULT_OPENAI_MODEL;

  return generateWithOpenAI(apiKey, {
    systemPrompt,
    userPrompt,
    model,
    effort: normalizeEffort(settings.openai_effort),
    maxTokens: screeningMaxTokens(settings.openai_max_tokens, params),
  });
}

export async function streamProposal(
  params: GenerateParams,
  onTextDelta: (delta: string) => void,
): Promise<AIGenerationResult> {
  const { settings, aiProvider } = params;

  const systemPrompt = buildProposalSystemPrompt(settings, params);
  const userPrompt = buildUserPrompt(params);

  if (aiProvider === "anthropic") {
    const apiKey = resolveAnthropicApiKey(settings.anthropic_api_key);
    if (!apiKey) {
      throw new MissingApiKeyError(
        "anthropic",
        "Add your Anthropic API key in Settings to generate with this model.",
      );
    }

    const model =
      params.aiModel ||
      settings.anthropic_model ||
      DEFAULT_ANTHROPIC_MODEL;

    return streamWithAnthropic(apiKey, {
      systemPrompt,
      userPrompt,
      model,
      effort: normalizeEffort(settings.anthropic_effort),
      maxTokens: screeningMaxTokens(settings.anthropic_max_tokens, params),
    }, onTextDelta);
  }

  const apiKey = resolveOpenAIApiKey(settings.openai_api_key);
  if (!apiKey) {
    throw new MissingApiKeyError(
    "openai",
    "Add your OpenAI API key in Settings to generate.",
  );
  }

  const model = params.aiModel || settings.openai_model || DEFAULT_OPENAI_MODEL;

  return streamWithOpenAI(apiKey, {
    systemPrompt,
    userPrompt,
    model,
    effort: normalizeEffort(settings.openai_effort),
    maxTokens: screeningMaxTokens(settings.openai_max_tokens, params),
  }, onTextDelta);
}

function buildHookOnlyPrompts(params: GenerateParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const { settings } = params;

  const systemPrompt =
    (settings as { hook_system_prompt?: string }).hook_system_prompt ||
    HOOK_SYSTEM_PROMPT;

  const effectiveHookType =
    params.hookType === "Custom" && !params.customHookInstruction
      ? DEFAULT_HOOK_FRAMEWORK_TYPE
      : params.hookType;

  const hookInstruction =
    params.hookType === "Custom" && params.customHookInstruction
      ? `Follow this custom instruction: ${params.customHookInstruction}`
      : `Use the "${effectiveHookType || DEFAULT_HOOK_FRAMEWORK_TYPE}" hook type framework.`;

  const userPromptParts: string[] = [];
  userPromptParts.push(`=== CLIENT'S JOB POST ===`);
  userPromptParts.push(`Title: ${params.jobTitle}`);
  userPromptParts.push(`Description:\n${params.jobDescription}`);
  userPromptParts.push(`=== END JOB POST ===\n`);

  if (params.clientName) {
    userPromptParts.push(`Client name: ${params.clientName}`);
  }

  userPromptParts.push(`\n--- TASK ---`);
  if (params.clientName) {
    userPromptParts.push(
      `Start the hook with "Hey ${params.clientName}," or "Hi ${params.clientName}," followed by your hook text.`,
    );
  }
  userPromptParts.push(
    `Generate ONLY the Hook (1 line) for a proposal targeting this job. The hook must be between 120 and 150 characters and should be concise and to the point.`,
  );
  userPromptParts.push(`Hook strategy: ${hookInstruction}`);

  if (params.tone) {
    userPromptParts.push(`Tone: ${params.tone}`);
  }

  userPromptParts.push(
    params.clientName
      ? `IMPORTANT: After the greeting, your hook must reference something SPECIFIC from the client's job post. Output ONLY the hook text (without tags).`
      : `IMPORTANT: Your FIRST sentence must reference something SPECIFIC from the client's job post. Output ONLY the hook text (without tags).`,
  );

  return {
    systemPrompt,
    userPrompt: userPromptParts.join("\n"),
  };
}

export async function generateHookOnly(
  params: GenerateParams,
): Promise<AIGenerationResult> {
  const { settings, aiProvider } = params;
  const { systemPrompt, userPrompt } = buildHookOnlyPrompts(params);

  if (aiProvider === "anthropic") {
    const apiKey = resolveAnthropicApiKey(settings.anthropic_api_key);
    if (!apiKey) {
      throw new MissingApiKeyError(
        "anthropic",
        "Add your Anthropic API key in Settings to generate with this model.",
      );
    }
    const model =
      params.aiModel ||
      settings.anthropic_model ||
      DEFAULT_ANTHROPIC_MODEL;
    return generateWithAnthropic(apiKey, {
      systemPrompt,
      userPrompt,
      model,
      effort: normalizeEffort(settings.anthropic_effort),
      maxTokens: settings.anthropic_max_tokens ?? 2000,
    });
  }

  const apiKey = resolveOpenAIApiKey(settings.openai_api_key);
  if (!apiKey) {
    throw new MissingApiKeyError(
    "openai",
    "Add your OpenAI API key in Settings to generate.",
  );
  }
  const model = params.aiModel || settings.openai_model || DEFAULT_OPENAI_MODEL;

  return generateWithOpenAI(apiKey, {
    systemPrompt,
    userPrompt,
    model,
    effort: normalizeEffort(settings.openai_effort),
    maxTokens: settings.openai_max_tokens ?? 2000,
  });
}

export async function streamHookOnly(
  params: GenerateParams,
  onTextDelta: (delta: string) => void,
): Promise<AIGenerationResult> {
  const { settings, aiProvider } = params;
  const { systemPrompt, userPrompt } = buildHookOnlyPrompts(params);

  if (aiProvider === "anthropic") {
    const apiKey = resolveAnthropicApiKey(settings.anthropic_api_key);
    if (!apiKey) {
      throw new MissingApiKeyError(
        "anthropic",
        "Add your Anthropic API key in Settings to generate with this model.",
      );
    }
    const model =
      params.aiModel ||
      settings.anthropic_model ||
      DEFAULT_ANTHROPIC_MODEL;
    return streamWithAnthropic(
      apiKey,
      {
        systemPrompt,
        userPrompt,
        model,
        effort: normalizeEffort(settings.anthropic_effort),
        maxTokens: settings.anthropic_max_tokens ?? 2000,
      },
      onTextDelta,
    );
  }

  const apiKey = resolveOpenAIApiKey(settings.openai_api_key);
  if (!apiKey) {
    throw new MissingApiKeyError(
    "openai",
    "Add your OpenAI API key in Settings to generate.",
  );
  }
  const model = params.aiModel || settings.openai_model || DEFAULT_OPENAI_MODEL;

  return streamWithOpenAI(
    apiKey,
    {
      systemPrompt,
      userPrompt,
      model,
      effort: normalizeEffort(settings.openai_effort),
      maxTokens: settings.openai_max_tokens ?? 2000,
    },
    onTextDelta,
  );
}
