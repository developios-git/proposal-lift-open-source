import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiting is optional. With Upstash unconfigured every getter returns
 * null and callers skip the check, so the app runs fine without it.
 */
export function isUpstashRateLimitConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (!isUpstashRateLimitConfigured()) {
    return null;
  }
  if (redis === undefined) {
    redis = Redis.fromEnv();
  }
  return redis;
}

function createLimiter(factory: (r: Redis) => Ratelimit): Ratelimit | null {
  const r = getRedis();
  if (!r) {
    return null;
  }
  return factory(r);
}

let authIp: Ratelimit | null | undefined;
let handoffIp: Ratelimit | null | undefined;
let handoffCreateUser: Ratelimit | null | undefined;
let proposalGenUser: Ratelimit | null | undefined;
let analyzeUrlUser: Ratelimit | null | undefined;
let templateGenUser: Ratelimit | null | undefined;
let qualifyJobUser: Ratelimit | null | undefined;
let enhanceCriteriaUser: Ratelimit | null | undefined;
let agencyMembersUser: Ratelimit | null | undefined;
let personaBulkImportUser: Ratelimit | null | undefined;
let knowledgeBaseImportUser: Ratelimit | null | undefined;
let knowledgeBaseStructureUser: Ratelimit | null | undefined;
let refineSelectionUser: Ratelimit | null | undefined;

/** Auth endpoints: POST /api/auth/* — limit credential stuffing & email abuse (per IP). */
export function getAuthIpRatelimit(): Ratelimit | null {
  if (authIp !== undefined) return authIp;
  authIp = createLimiter(
    (r) =>
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(10, "15 m"),
        prefix: "rl:auth-ip",
        analytics: false,
      }),
  );
  return authIp;
}

/** Extension handoff create — per authenticated user: max 5 per minute. */
export function getHandoffCreateUserRatelimit(): Ratelimit | null {
  if (handoffCreateUser !== undefined) return handoffCreateUser;
  handoffCreateUser = createLimiter(
    (r) =>
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(5, "1 m"),
        prefix: "rl:handoff-create",
        analytics: false,
      }),
  );
  return handoffCreateUser;
}

/** Extension handoff redeem — burst-friendly cap per IP. */
export function getHandoffIpRatelimit(): Ratelimit | null {
  if (handoffIp !== undefined) return handoffIp;
  handoffIp = createLimiter(
    (r) =>
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(30, "1 m"),
        prefix: "rl:handoff-ip",
        analytics: false,
      }),
  );
  return handoffIp;
}

export function getProposalGenerateUserRatelimit(): Ratelimit | null {
  if (proposalGenUser !== undefined) return proposalGenUser;
  proposalGenUser = createLimiter(
    (r) =>
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(25, "1 m"),
        prefix: "rl:proposal-gen",
        analytics: false,
      }),
  );
  return proposalGenUser;
}

export function getAnalyzeUrlUserRatelimit(): Ratelimit | null {
  if (analyzeUrlUser !== undefined) return analyzeUrlUser;
  analyzeUrlUser = createLimiter(
    (r) =>
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(15, "1 m"),
        prefix: "rl:analyze-url",
        analytics: false,
      }),
  );
  return analyzeUrlUser;
}

export function getTemplateGenerateUserRatelimit(): Ratelimit | null {
  if (templateGenUser !== undefined) return templateGenUser;
  templateGenUser = createLimiter(
    (r) =>
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(20, "1 m"),
        prefix: "rl:template-gen",
        analytics: false,
      }),
  );
  return templateGenUser;
}

/**
 * AI Job Qualify, single job — per authenticated user. Click-driven, so a user
 * can fire this repeatedly down a long feed; 30/min allows working through a
 * page of jobs without letting a stuck loop burn their API quota.
 */
export function getQualifyJobUserRatelimit(): Ratelimit | null {
  if (qualifyJobUser !== undefined) return qualifyJobUser;
  qualifyJobUser = createLimiter(
    (r) =>
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(30, "1 m"),
        prefix: "rl:qualify-job",
        analytics: false,
      }),
  );
  return qualifyJobUser;
}

/**
 * Inline proposal refine — per authenticated user. Selection-driven and cheap
 * per call, but a user polishing a draft fires it in bursts, so 20/min leaves
 * room to work through a proposal without letting a stuck retry run away.
 */
export function getRefineSelectionUserRatelimit(): Ratelimit | null {
  if (refineSelectionUser !== undefined) return refineSelectionUser;
  refineSelectionUser = createLimiter(
    (r) =>
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(20, "1 m"),
        prefix: "rl:refine-selection",
        analytics: false,
      }),
  );
  return refineSelectionUser;
}

/** Qualify-criteria enhancement — per authenticated user. A setup action, rarely repeated. */
export function getEnhanceCriteriaUserRatelimit(): Ratelimit | null {
  if (enhanceCriteriaUser !== undefined) return enhanceCriteriaUser;
  enhanceCriteriaUser = createLimiter(
    (r) =>
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(10, "5 m"),
        prefix: "rl:enhance-criteria",
        analytics: false,
      }),
  );
  return enhanceCriteriaUser;
}

/** Upwork agency member preview — per authenticated user: max 6 per minute. Each call costs up to 3 Upwork API requests. */
export function getAgencyMembersUserRatelimit(): Ratelimit | null {
  if (agencyMembersUser !== undefined) return agencyMembersUser;
  agencyMembersUser = createLimiter(
    (r) =>
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(6, "1 m"),
        prefix: "rl:agency-members",
        analytics: false,
      }),
  );
  return agencyMembersUser;
}

/** Upwork bulk persona import — per authenticated user: max 3 per 5 minutes. Writes many rows and costs up to 3 Upwork API requests. */
export function getPersonaBulkImportUserRatelimit(): Ratelimit | null {
  if (personaBulkImportUser !== undefined) return personaBulkImportUser;
  personaBulkImportUser = createLimiter(
    (r) =>
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(3, "5 m"),
        prefix: "rl:persona-bulk-import",
        analytics: false,
      }),
  );
  return personaBulkImportUser;
}

/**
 * Knowledge base document import — per authenticated user: max 10 per 5 minutes.
 * A setup action done once or twice, and each call buffers up to 10 MB and runs
 * a PDF parser, so it needs a real ceiling.
 */
export function getKnowledgeBaseImportUserRatelimit(): Ratelimit | null {
  if (knowledgeBaseImportUser !== undefined) return knowledgeBaseImportUser;
  knowledgeBaseImportUser = createLimiter(
    (r) =>
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(10, "5 m"),
        prefix: "rl:kb-import",
        analytics: false,
      }),
  );
  return knowledgeBaseImportUser;
}

/** Knowledge base AI structuring — per authenticated user: max 10 per 5 minutes. Calls the user's own AI key. */
export function getKnowledgeBaseStructureUserRatelimit(): Ratelimit | null {
  if (knowledgeBaseStructureUser !== undefined)
    return knowledgeBaseStructureUser;
  knowledgeBaseStructureUser = createLimiter(
    (r) =>
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(10, "5 m"),
        prefix: "rl:kb-structure",
        analytics: false,
      }),
  );
  return knowledgeBaseStructureUser;
}
