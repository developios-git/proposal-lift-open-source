import { QUALIFY_PROMPT_VERSION } from "./constants";

/**
 * sessionStorage key for a filter's qualify verdicts.
 *
 * Two things are baked in on purpose:
 *  - the criteria hash, so editing the criteria mints a new key;
 *  - the prompt version, so changing what the model is told also discards
 *    verdicts it produced under the old prompt.
 *
 * Between them, no cache-invalidation logic is needed anywhere else.
 */

/** FNV-1a. Not cryptographic — this only needs to be stable and cheap. */
function hashCriteria(criteria: string): string {
  let h = 0x811c9dc5;
  const normalized = criteria.trim();
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function qualifyCacheKey(filterId: string, criteria: string): string {
  return `qualify:v${QUALIFY_PROMPT_VERSION}:${filterId}:${hashCriteria(criteria)}`;
}
