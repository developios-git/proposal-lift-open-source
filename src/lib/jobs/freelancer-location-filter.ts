/**
 * Client-side filtering on a job's `preferredFreelancerLocation` — the countries
 * the client wants freelancers from.
 *
 * This cannot be pushed to the API: `MarketplaceJobPostingsSearchFilter` exposes
 * only `locations_any`, which filters by *client* location, not by the client's
 * freelancer preference. So it runs after the fetch, alongside the other
 * client-side post-filters.
 */

export type LocationFilterMode = "include" | "exclude" | "only";

/** Europe per this filter, UK included — see the 2026-07 design decision. */
const EUROPE_COUNTRIES = new Set(
  [
    "Albania",
    "Andorra",
    "Austria",
    "Belarus",
    "Belgium",
    "Bosnia and Herzegovina",
    "Bulgaria",
    "Croatia",
    "Cyprus",
    "Czech Republic",
    "Czechia",
    "Denmark",
    "Estonia",
    "Finland",
    "France",
    "Germany",
    "Greece",
    "Hungary",
    "Iceland",
    "Ireland",
    "Italy",
    "Kosovo",
    "Latvia",
    "Liechtenstein",
    "Lithuania",
    "Luxembourg",
    "Malta",
    "Moldova",
    "Monaco",
    "Montenegro",
    "Netherlands",
    "North Macedonia",
    "Norway",
    "Poland",
    "Portugal",
    "Romania",
    "San Marino",
    "Serbia",
    "Slovakia",
    "Slovenia",
    "Spain",
    "Sweden",
    "Switzerland",
    "Ukraine",
    "United Kingdom",
    "UK",
    "Great Britain",
    "England",
    "Scotland",
    "Wales",
    "Northern Ireland",
    "Vatican City",
  ].map((c) => c.toLowerCase()),
);

const US_NAMES = new Set(
  [
    "United States",
    "United States of America",
    "USA",
    "US",
    "U.S.",
    "U.S.A.",
    "America",
  ].map((c) => c.toLowerCase()),
);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function isUnitedStates(location: string): boolean {
  return US_NAMES.has(normalize(location));
}

export function isEurope(location: string): boolean {
  return EUROPE_COUNTRIES.has(normalize(location));
}

export interface FreelancerLocationFilters {
  us_filter?: LocationFilterMode;
  europe_filter?: LocationFilterMode;
  /** Whether jobs that state no preference survive an active `only`/`exclude` rule. */
  show_without_country_preference?: boolean;
}

/** True when at least one region rule would actually change the result set. */
export function hasActiveFreelancerLocationFilter(
  filters: FreelancerLocationFilters | undefined | null,
): boolean {
  if (!filters) return false;
  const us = filters.us_filter ?? "include";
  const europe = filters.europe_filter ?? "include";
  return us !== "include" || europe !== "include";
}

/**
 * Decides whether a job survives the freelancer-location rules.
 *
 * - `include` places no constraint.
 * - `exclude` drops jobs whose preference list contains the region.
 * - `only` keeps jobs whose preference list contains the region.
 *
 * A job stating no preference cannot satisfy an `only` rule, so it is dropped
 * unless `show_without_country_preference` is on. `exclude` rules never drop it,
 * since there is nothing to exclude.
 */
export function jobMatchesFreelancerLocationFilters(
  preferredLocations: string[] | null | undefined,
  filters: FreelancerLocationFilters | undefined | null,
): boolean {
  if (!hasActiveFreelancerLocationFilter(filters)) return true;

  const us = filters?.us_filter ?? "include";
  const europe = filters?.europe_filter ?? "include";
  const locations = (preferredLocations ?? []).filter(
    (l): l is string => typeof l === "string" && l.trim().length > 0,
  );

  if (locations.length === 0) {
    const hasOnlyRule = us === "only" || europe === "only";
    if (!hasOnlyRule) return true;
    return filters?.show_without_country_preference === true;
  }

  const prefersUs = locations.some(isUnitedStates);
  const prefersEurope = locations.some(isEurope);

  if (us === "exclude" && prefersUs) return false;
  if (europe === "exclude" && prefersEurope) return false;

  // Multiple `only` rules are a union: "only US or Europe", not "both".
  const onlyRegions: boolean[] = [];
  if (us === "only") onlyRegions.push(prefersUs);
  if (europe === "only") onlyRegions.push(prefersEurope);
  if (onlyRegions.length > 0 && !onlyRegions.some(Boolean)) return false;

  return true;
}
