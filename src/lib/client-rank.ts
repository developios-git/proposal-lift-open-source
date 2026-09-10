/**
 * Client Rank scoring.
 *
 * The badge answers one question: can this client be trusted to pay? It is
 * deliberately *not* about whether the job is worth bidding on. Competition,
 * budget and re-post status belong to the posting, not the client, so they stay
 * out of the score even though the popover displays them.
 *
 * Payment verification is a gate rather than a factor: if the client cannot be
 * charged, nothing else matters. Everything else is a weighted band, and every
 * band may return `null` when Upwork gave us nothing to judge on. Absent is not
 * the same as zero — a client who hides their financials must not score like a
 * client who has genuinely never spent a cent. When too little resolves, the
 * result is `Unknown` and the UI shows a neutral badge instead of guessing.
 *
 * The result carries its own evidence in `factors` so `ClientRankPopover` can
 * render the reasoning without recomputing anything. That is what keeps the
 * badge and the popover from disagreeing.
 */

import { computeClientHireRate, formatClientHireRate } from "@/lib/jobs/client-hire-rate";

export type ClientRankStatus = "Risky" | "Medium" | "Excellent" | "Unknown";

export type ClientRankFactorKey =
  | "spend"
  | "hire_rate"
  | "rating"
  | "hire_volume";

export interface ClientRankFactor {
  key: ClientRankFactorKey;
  /** Row heading in the popover's "Why this rank" list. */
  label: string;
  /** 0..1, or `null` when Upwork gave us nothing to judge on. */
  subscore: number | null;
  weight: number;
  /** `subscore * weight`, 0 when unresolved. Orders the popover. */
  contribution: number;
  /** Human-readable evidence, e.g. "$12,400 spent" or "Hidden by client". */
  detail: string;
}

export interface ClientRankResult {
  /** `null` when `status` is `Unknown`. */
  score: 1 | 3 | 5 | null;
  status: ClientRankStatus;
  /** Share of the total weight that resolved, 0..1. */
  confidence: number;
  /** Every factor, resolved or not, ordered by contribution. */
  factors: ClientRankFactor[];
}

export interface JobClientData {
  client_payment_verified?: boolean | null;
  client_total_spent?: number | null;
  client_total_hires?: number | null;
  /** Jobs the client has posted overall. The hire-rate denominator. */
  client_total_posted_jobs?: number | null;
  client_avg_rating?: number | null;
  client_total_reviews?: number | null;
  /**
   * Upwork's `hasFinancialPrivacy`. When true, `client_total_spent` is hidden
   * rather than zero, and the spend factor reports unknown instead of scoring 0.
   */
  has_financial_privacy?: boolean | null;
  client_country?: string | null;
  client_member_since?: string | null;
  client_city?: string | null;
  /** What the client last hired someone for. Unrelated to the current posting. */
  client_last_contract_title?: string | null;
  /** Number of freelancers who have applied. Shown in the popover, never scored. */
  total_applicants?: number | null;
  /** Set only when the client re-posted the listing — drives the "Renewed" badge. */
  renewed_at?: string | null;
}

/** Alias for popover/UI components */
export type ClientRankJob = JobClientData;

const WEIGHTS: Record<ClientRankFactorKey, number> = {
  spend: 0.4,
  hire_rate: 0.25,
  rating: 0.2,
  hire_volume: 0.15,
};

/**
 * Below this share of resolved weight the badge shows "Not enough data" instead
 * of a colour. Set at 0.35 so that rating plus hire volume alone is enough to
 * judge, while a single light factor is not.
 */
export const CLIENT_RANK_CONFIDENCE_FLOOR = 0.35;

/** `weighted` at or above these lands on the matching score. */
const EXCELLENT_THRESHOLD = 0.65;
const MEDIUM_THRESHOLD = 0.35;

/**
 * Minimum posted jobs before a hire *rate* means anything. Without it a client
 * who posted once and hired once reads as a flawless 100%.
 *
 * This lives here rather than in `computeClientHireRate` because that helper
 * also backs the saved-filter post-filters, whose behaviour must not change.
 */
const HIRE_RATE_MIN_POSTS = 3;

/** Reviews needed before a rating is taken at full strength. */
const RATING_CONFIDENCE_REVIEWS = 10;

/** Star rating at or below which the quality sub-score bottoms out. */
const RATING_FLOOR_STARS = 3;
const RATING_TOP_STARS = 5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Keeps float noise out of the confidence comparison and the returned value. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function isUsableNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function scoreSpend(job: JobClientData): Pick<ClientRankFactor, "subscore" | "detail"> {
  if (job.has_financial_privacy === true) {
    return { subscore: null, detail: "Hidden by client" };
  }
  const spent = job.client_total_spent;
  if (!isUsableNumber(spent) || spent < 0) {
    return { subscore: null, detail: "Not reported" };
  }
  const detail = `$${spent.toLocaleString(undefined, { maximumFractionDigits: 0 })} spent`;
  if (spent < 1) return { subscore: 0, detail };
  if (spent < 1_000) return { subscore: 0.35, detail };
  if (spent < 10_000) return { subscore: 0.7, detail };
  return { subscore: 1, detail };
}

function scoreHireRate(job: JobClientData): Pick<ClientRankFactor, "subscore" | "detail"> {
  const posted = job.client_total_posted_jobs;
  if (isUsableNumber(posted) && posted > 0 && posted < HIRE_RATE_MIN_POSTS) {
    return { subscore: null, detail: "Too few posts to judge" };
  }
  const rate = computeClientHireRate(job.client_total_hires, posted);
  if (rate == null) return { subscore: null, detail: "Not reported" };

  const detail = formatClientHireRate(rate) ?? "Not reported";
  if (rate < 20) return { subscore: 0, detail };
  if (rate < 50) return { subscore: 0.4, detail };
  if (rate < 80) return { subscore: 0.75, detail };
  return { subscore: 1, detail };
}

/**
 * Rating scaled by how much evidence backs it. One five-star review is noise and
 * lands near neutral; ten or more reviews carry their full weight, so a poor
 * average across a real history can drag an otherwise wealthy client down.
 */
function scoreRating(job: JobClientData): Pick<ClientRankFactor, "subscore" | "detail"> {
  const reviews = job.client_total_reviews;
  const rating = job.client_avg_rating;
  if (!isUsableNumber(reviews) || reviews <= 0) {
    return { subscore: null, detail: "No reviews yet" };
  }
  if (!isUsableNumber(rating) || rating <= 0) {
    return {
      subscore: null,
      detail: `${reviews} review${reviews === 1 ? "" : "s"}, no rating`,
    };
  }

  const quality = clamp01(
    (rating - RATING_FLOOR_STARS) / (RATING_TOP_STARS - RATING_FLOOR_STARS),
  );
  const confidence = Math.min(reviews / RATING_CONFIDENCE_REVIEWS, 1);
  return {
    subscore: 0.5 + (quality - 0.5) * confidence,
    detail: `${rating.toFixed(1)} from ${reviews} review${reviews === 1 ? "" : "s"}`,
  };
}

function scoreHireVolume(job: JobClientData): Pick<ClientRankFactor, "subscore" | "detail"> {
  const hires = job.client_total_hires;
  if (!isUsableNumber(hires) || hires < 0) {
    return { subscore: null, detail: "Not reported" };
  }
  if (hires === 0) return { subscore: 0, detail: "No hires yet" };
  const detail = `${hires} hire${hires === 1 ? "" : "s"}`;
  if (hires < 5) return { subscore: 0.5, detail };
  if (hires < 20) return { subscore: 0.8, detail };
  return { subscore: 1, detail };
}

const FACTOR_DEFS: Array<{
  key: ClientRankFactorKey;
  label: string;
  score: (job: JobClientData) => Pick<ClientRankFactor, "subscore" | "detail">;
}> = [
  { key: "spend", label: "Total spent", score: scoreSpend },
  { key: "hire_rate", label: "Hire rate", score: scoreHireRate },
  { key: "rating", label: "Client rating", score: scoreRating },
  { key: "hire_volume", label: "Hires", score: scoreHireVolume },
];

function buildFactors(job: JobClientData): ClientRankFactor[] {
  return FACTOR_DEFS.map(({ key, label, score }) => {
    const { subscore, detail } = score(job);
    const weight = WEIGHTS[key];
    return {
      key,
      label,
      subscore,
      weight,
      contribution: subscore == null ? 0 : round4(subscore * weight),
      detail,
    };
  }).sort((a, b) => b.contribution - a.contribution);
}

/**
 * Score a client on payment verification plus four weighted factors.
 *
 * The gate is checked *before* the confidence floor on purpose: verification is
 * always known, so "unverified" is a judgment we can make even when every other
 * factor is blank. A brand-new client with an unverified card reads Risky, not
 * Unknown.
 */
export function computeClientRankScore(job: JobClientData): ClientRankResult {
  const factors = buildFactors(job);

  if (job.client_payment_verified !== true) {
    return { score: 1, status: "Risky", confidence: 1, factors };
  }

  const resolved = factors.filter((f) => f.subscore != null);
  const confidence = round4(
    resolved.reduce((sum, f) => sum + f.weight, 0),
  );

  if (confidence < CLIENT_RANK_CONFIDENCE_FLOOR) {
    return { score: null, status: "Unknown", confidence, factors };
  }

  // Normalising by the resolved weight rather than by 1.0 is what stops a
  // client who hides their financials from being punished for the gap.
  const weighted =
    resolved.reduce((sum, f) => sum + f.subscore! * f.weight, 0) / confidence;

  if (weighted >= EXCELLENT_THRESHOLD) {
    return { score: 5, status: "Excellent", confidence, factors };
  }
  if (weighted >= MEDIUM_THRESHOLD) {
    return { score: 3, status: "Medium", confidence, factors };
  }
  return { score: 1, status: "Risky", confidence, factors };
}

/** Map country to primary timezone for client local time */
export const COUNTRY_TIMEZONES: Record<string, string> = {
  US: "America/New_York",
  "United States": "America/New_York",
  USA: "America/New_York",
  KR: "Asia/Seoul",
  "South Korea": "Asia/Seoul",
  UK: "Europe/London",
  "United Kingdom": "Europe/London",
  GB: "Europe/London",
  CA: "America/Toronto",
  Canada: "America/Toronto",
  IN: "Asia/Kolkata",
  India: "Asia/Kolkata",
  AU: "Australia/Sydney",
  Australia: "Australia/Sydney",
  DE: "Europe/Berlin",
  Germany: "Europe/Berlin",
  FR: "Europe/Paris",
  France: "Europe/Paris",
  PH: "Asia/Manila",
  Philippines: "Asia/Manila",
  PK: "Asia/Karachi",
  Pakistan: "Asia/Karachi",
  NG: "Africa/Lagos",
  Nigeria: "Africa/Lagos",
  BD: "Asia/Dhaka",
  Bangladesh: "Asia/Dhaka",
  UA: "Europe/Kyiv",
  Ukraine: "Europe/Kyiv",
  PL: "Europe/Warsaw",
  Poland: "Europe/Warsaw",
  ES: "Europe/Madrid",
  Spain: "Europe/Madrid",
  IT: "Europe/Rome",
  Italy: "Europe/Rome",
  BR: "America/Sao_Paulo",
  Brazil: "America/Sao_Paulo",
  NL: "Europe/Amsterdam",
  Netherlands: "Europe/Amsterdam",
  RO: "Europe/Bucharest",
  Romania: "Europe/Bucharest",
  AR: "America/Argentina/Buenos_Aires",
  Argentina: "America/Argentina/Buenos_Aires",
  RU: "Europe/Moscow",
  Russia: "Europe/Moscow",
  CN: "Asia/Shanghai",
  China: "Asia/Shanghai",
  JP: "Asia/Tokyo",
  Japan: "Asia/Tokyo",
  MX: "America/Mexico_City",
  Mexico: "America/Mexico_City",
  EG: "Africa/Cairo",
  Egypt: "Africa/Cairo",
  VN: "Asia/Ho_Chi_Minh",
  Vietnam: "Asia/Ho_Chi_Minh",
  ID: "Asia/Jakarta",
  Indonesia: "Asia/Jakarta",
  TR: "Europe/Istanbul",
  Turkey: "Europe/Istanbul",
};

export function getClientCurrentTime(
  country: string | null | undefined,
  city?: string | null,
): string {
  if (!country) return "—";
  const tz =
    COUNTRY_TIMEZONES[country] ??
    COUNTRY_TIMEZONES[country.toUpperCase()];
  if (!tz) return "—";
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const timeStr = formatter.format(now);
    const cityPart = city?.trim() ? `${city} ` : "";
    return `${cityPart}${timeStr}`;
  } catch {
    return "—";
  }
}

export function formatMemberSince(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}
