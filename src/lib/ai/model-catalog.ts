import type { AIProvider } from "@/lib/ai/ai-failure";

/**
 * What counts as a model the user may generate with.
 *
 * Until this module existed the answer was four hardcoded arrays that disagreed
 * with each other — one in the settings page, one in the new-proposal page, one
 * in `SETTINGS_DEFAULTS`, and eight literal fallbacks in `generate.ts`. A new
 * release meant four coordinated edits, and a self-hoster on an older build
 * never saw it at all. The lists are gone: Settings now asks each provider what
 * it offers, using the user's own key, and filters the answer through here.
 *
 * The two constants below are all that remain hardcoded, and they are not a
 * catalog — they are the value a user has when they have never chosen one.
 *
 * `import type` above is load-bearing: `ai-failure` imports both provider SDKs
 * at module scope, and a type-only import is erased, so this module stays pure
 * and cheap for the unit test to load.
 */

/**
 * The oldest GPT generation worth offering.
 *
 * A floor, deliberately, not an allowlist: anything newer passes on its own, so
 * this needs revisiting only to raise the bar, never to admit a release. Keep
 * `DEFAULT_OPENAI_MODEL` at or above it — a default the filter rejects would
 * leave every new user pointing at a model the dropdown does not list.
 */
export const MIN_OPENAI_GPT_VERSION = 5.5;

/**
 * The oldest Claude generation worth offering. Same reasoning as the GPT floor.
 *
 * Set at 4.6 because that is where Anthropic switches from publishing only
 * pinned snapshots (`claude-sonnet-4-5-20250929`) to publishing floating ids
 * (`claude-opus-4-6`), so the floor also clears the dated entries out of the
 * dropdown without this module ever inventing an id the API did not list.
 */
export const MIN_ANTHROPIC_VERSION = 4.6;

export const DEFAULT_OPENAI_MODEL = "gpt-5.5";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

/**
 * A pinned-snapshot suffix, in either provider's spelling: Anthropic writes
 * `claude-sonnet-4-5-20250929`, OpenAI writes `gpt-5.5-pro-2026-04-23`.
 */
const DATED_SNAPSHOT = /-(\d{8}|\d{4}-\d{2}-\d{2})$/;

/** `gpt-5.5-pro-2026-04-23` -> `gpt-5.5-pro`. Unchanged if already undated. */
export function baseModelId(id: string): string {
  return id.trim().toLowerCase().replace(DATED_SNAPSHOT, "");
}

/**
 * The generation number in an OpenAI id, or null if it is not a GPT model.
 *
 * `gpt-5.5-pro` -> 5.5, `gpt-5-mini` -> 5, `gpt-4o` -> 4. The `o1`/`o3`
 * reasoning series returns null and is therefore excluded: it carries no
 * comparable version, and every released member predates the floor above.
 */
function openAiGptVersion(id: string): number | null {
  const match = /^gpt-(\d+(?:\.\d+)?)/.exec(id);
  return match ? Number.parseFloat(match[1]) : null;
}

/**
 * The generation number in a Claude id, or null if it does not parse.
 *
 * `claude-opus-4-6` -> 4.6, `claude-opus-5` -> 5, `claude-fable-5-1` -> 5.1.
 * The date is stripped first, so a snapshot scores the same as the model it
 * pins. Anthropic's pre-4 ids put the version before the family
 * (`claude-3-5-sonnet-...`); those return null and are excluded, which is the
 * wanted outcome since every one of them is far below the floor.
 *
 * Minor versions are read as decimals, so this would rank a hypothetical
 * `4-10` below `4-9`. Anthropic has never shipped a two-digit minor; revisit
 * if that changes.
 */
function anthropicVersion(id: string): number | null {
  const match = /^claude-[a-z]+-(\d+)(?:-(\d+))?$/.exec(baseModelId(id));
  if (!match) return null;
  return Number.parseFloat(match[2] ? `${match[1]}.${match[2]}` : match[1]);
}

/**
 * Substrings that disqualify an otherwise GPT-shaped id. These are the ones the
 * version test alone lets through and a chat request then fails on: they take
 * audio, hold a websocket session, transcribe, synthesise speech, run a hosted
 * search, or generate an image.
 */
const OPENAI_NON_CHAT_TOKENS = [
  "-audio",
  "-realtime",
  "-transcribe",
  "-tts",
  "-search",
  "-image",
  "-embedding",
  "instruct",
  "moderation",
  "dall-e",
  "whisper",
  "babbage",
  "davinci",
];

/**
 * Whether `id` is a model this app can generate a proposal with.
 *
 * Deliberately permissive about the future and strict about the past: an
 * unrecognised `gpt-9-whatever` passes, because the whole point is that new
 * releases arrive without a code change, while every known non-chat family and
 * every generation below the floor is rejected.
 */
export function isChatModelId(provider: AIProvider, id: string): boolean {
  const normalized = id.trim().toLowerCase();
  if (!normalized) return false;

  // Anthropic's models endpoint only ever returns text models, so the prefix is
  // a sanity check against a mixed-up provider argument rather than a filter.
  // The version is the actual gate.
  if (provider === "anthropic") {
    if (!normalized.startsWith("claude-")) return false;
    const version = anthropicVersion(normalized);
    return version !== null && version >= MIN_ANTHROPIC_VERSION;
  }

  // Fine-tunes are `ft:<base>:<org>::<id>`. They may well be chat-capable, but
  // they are per-account artifacts, not something to list as a choice.
  if (normalized.startsWith("ft:")) return false;

  const version = openAiGptVersion(normalized);
  if (version === null || version < MIN_OPENAI_GPT_VERSION) return false;

  return !OPENAI_NON_CHAT_TOKENS.some((token) => normalized.includes(token));
}

/**
 * Collapses pinned snapshots into the model they pin.
 *
 * Both providers list a floating id beside its dated snapshots, so an unfiltered
 * list shows the same model several times — `gpt-5.5-pro` next to
 * `gpt-5.5-pro-2026-04-23`, `claude-sonnet-4-5` next to
 * `claude-sonnet-4-5-20250929` — which reads as noise and makes the real choice
 * hard to find.
 *
 * The undated id wins where one exists: it tracks the latest snapshot, which is
 * what someone picking "Claude Sonnet 4.5" from a settings screen means. Where a
 * provider publishes only dated ids, the newest is kept, since dropping the
 * group entirely would hide a model the user is entitled to use. Distinct
 * versions are never merged — `claude-opus-4-7` and `claude-opus-4-8` are
 * different models, not duplicates of each other.
 */
export function dedupeModelIds(ids: string[]): string[] {
  const groups = new Map<string, string[]>();

  for (const id of ids) {
    const base = baseModelId(id);
    const existing = groups.get(base);
    if (existing) existing.push(id);
    else groups.set(base, [id]);
  }

  const kept: string[] = [];
  for (const [base, group] of groups) {
    if (group.includes(base)) {
      kept.push(base);
      continue;
    }
    // Fixed-width dates in a shared prefix, so lexicographic order is
    // chronological order.
    kept.push([...group].sort()[group.length - 1]);
  }

  return kept.sort();
}

/**
 * What `GET /api/ai/models` reports for one provider.
 *
 * `connected` and `error` are separate on purpose. Having no key saved is the
 * first-run state, not a failure, and must not surface as one — so the empty
 * dropdown a new user sees carries `error: null` and reads "add a key", while a
 * revoked key reads as the problem it is.
 *
 * `models` is empty unless a live fetch succeeded. There is no hardcoded
 * fallback list: showing someone a stale catalog they cannot actually reach is
 * the failure mode this whole module exists to remove.
 */
export type ProviderCatalog = {
  /** A key is saved for this provider. */
  connected: boolean;
  /** Live ids that passed `isChatModelId`, deduped, or `[]`. */
  models: string[];
  /** Set only when `connected` and the lookup failed. */
  error: string | null;
};

export type ModelCatalog = Record<AIProvider, ProviderCatalog>;
