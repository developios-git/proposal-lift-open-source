/**
 * Canonical client country names + aliases for filter matching and search.
 * Values stored in filter criteria are always canonical English names.
 */

export const FILTER_COUNTRY_CANONICALS: readonly string[] = [
  "Afghanistan",
  "Algeria",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bangladesh",
  "Belarus",
  "Belgium",
  "Bolivia",
  "Brazil",
  "Bulgaria",
  "Cambodia",
  "Canada",
  "Chile",
  "China",
  "Colombia",
  "Costa Rica",
  "Croatia",
  "Cyprus",
  "Czech Republic",
  "Denmark",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "Estonia",
  "Ethiopia",
  "Finland",
  "France",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Hong Kong",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Kazakhstan",
  "Kenya",
  "Laos",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Malaysia",
  "Malta",
  "Mexico",
  "Moldova",
  "Morocco",
  "Myanmar",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nigeria",
  "Norway",
  "Pakistan",
  "Panama",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Russia",
  "Saudi Arabia",
  "Serbia",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "South Africa",
  "South Korea",
  "Spain",
  "Sri Lanka",
  "Sweden",
  "Switzerland",
  "Taiwan",
  "Tanzania",
  "Thailand",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Venezuela",
  "Vietnam",
].sort((a, b) => a.localeCompare(b));

/** ISO 3166-1 alpha-2 for display (non-emoji) in filter UI */
const ISO2_BY_CANONICAL: Record<string, string> = {
  Afghanistan: "AF",
  Algeria: "DZ",
  Argentina: "AR",
  Armenia: "AM",
  Australia: "AU",
  Austria: "AT",
  Azerbaijan: "AZ",
  Bangladesh: "BD",
  Belarus: "BY",
  Belgium: "BE",
  Bolivia: "BO",
  Brazil: "BR",
  Bulgaria: "BG",
  Cambodia: "KH",
  Canada: "CA",
  Chile: "CL",
  China: "CN",
  Colombia: "CO",
  "Costa Rica": "CR",
  Croatia: "HR",
  Cyprus: "CY",
  "Czech Republic": "CZ",
  Denmark: "DK",
  "Dominican Republic": "DO",
  Ecuador: "EC",
  Egypt: "EG",
  Estonia: "EE",
  Ethiopia: "ET",
  Finland: "FI",
  France: "FR",
  Georgia: "GE",
  Germany: "DE",
  Ghana: "GH",
  Greece: "GR",
  "Hong Kong": "HK",
  Hungary: "HU",
  Iceland: "IS",
  India: "IN",
  Indonesia: "ID",
  Iran: "IR",
  Iraq: "IQ",
  Ireland: "IE",
  Israel: "IL",
  Italy: "IT",
  Jamaica: "JM",
  Japan: "JP",
  Kazakhstan: "KZ",
  Kenya: "KE",
  Laos: "LA",
  Latvia: "LV",
  Lithuania: "LT",
  Luxembourg: "LU",
  Malaysia: "MY",
  Malta: "MT",
  Mexico: "MX",
  Moldova: "MD",
  Morocco: "MA",
  Myanmar: "MM",
  Nepal: "NP",
  Netherlands: "NL",
  "New Zealand": "NZ",
  Nigeria: "NG",
  Norway: "NO",
  Pakistan: "PK",
  Panama: "PA",
  Paraguay: "PY",
  Peru: "PE",
  Philippines: "PH",
  Poland: "PL",
  Portugal: "PT",
  Qatar: "QA",
  Romania: "RO",
  Russia: "RU",
  "Saudi Arabia": "SA",
  Serbia: "RS",
  Singapore: "SG",
  Slovakia: "SK",
  Slovenia: "SI",
  "South Africa": "ZA",
  "South Korea": "KR",
  Spain: "ES",
  "Sri Lanka": "LK",
  Sweden: "SE",
  Switzerland: "CH",
  Taiwan: "TW",
  Tanzania: "TZ",
  Thailand: "TH",
  "Trinidad and Tobago": "TT",
  Tunisia: "TN",
  Turkey: "TR",
  Uganda: "UG",
  Ukraine: "UA",
  "United Arab Emirates": "AE",
  "United Kingdom": "GB",
  "United States": "US",
  Uruguay: "UY",
  Uzbekistan: "UZ",
  Venezuela: "VE",
  Vietnam: "VN",
};

export function iso2ForCanonical(canonical: string): string | null {
  return ISO2_BY_CANONICAL[canonical] ?? null;
}

/**
 * ISO 3166-1 alpha-3 → canonical name.
 *
 * Upwork's `client.location.country` returns alpha-3 codes ("AUS", "DEU").
 * Some resolved by accident through the substring fallback in
 * `normalizeJobCountryToCanonical` — "australia".includes("aus") — but others
 * did not ("germany" does not contain "deu"), so flags appeared for some
 * countries and not others. This map makes it deterministic.
 */
const ISO3_TO_CANONICAL: Record<string, string> = {
  AFG: "Afghanistan",
  DZA: "Algeria",
  ARG: "Argentina",
  ARM: "Armenia",
  AUS: "Australia",
  AUT: "Austria",
  AZE: "Azerbaijan",
  BGD: "Bangladesh",
  BLR: "Belarus",
  BEL: "Belgium",
  BOL: "Bolivia",
  BRA: "Brazil",
  BGR: "Bulgaria",
  KHM: "Cambodia",
  CAN: "Canada",
  CHL: "Chile",
  CHN: "China",
  COL: "Colombia",
  CRI: "Costa Rica",
  HRV: "Croatia",
  CYP: "Cyprus",
  CZE: "Czech Republic",
  DNK: "Denmark",
  DOM: "Dominican Republic",
  ECU: "Ecuador",
  EGY: "Egypt",
  EST: "Estonia",
  ETH: "Ethiopia",
  FIN: "Finland",
  FRA: "France",
  GEO: "Georgia",
  DEU: "Germany",
  GHA: "Ghana",
  GRC: "Greece",
  HKG: "Hong Kong",
  HUN: "Hungary",
  ISL: "Iceland",
  IND: "India",
  IDN: "Indonesia",
  IRN: "Iran",
  IRQ: "Iraq",
  IRL: "Ireland",
  ISR: "Israel",
  ITA: "Italy",
  JAM: "Jamaica",
  JPN: "Japan",
  KAZ: "Kazakhstan",
  KEN: "Kenya",
  LAO: "Laos",
  LVA: "Latvia",
  LTU: "Lithuania",
  LUX: "Luxembourg",
  MYS: "Malaysia",
  MLT: "Malta",
  MEX: "Mexico",
  MDA: "Moldova",
  MAR: "Morocco",
  MMR: "Myanmar",
  NPL: "Nepal",
  NLD: "Netherlands",
  NZL: "New Zealand",
  NGA: "Nigeria",
  NOR: "Norway",
  PAK: "Pakistan",
  PAN: "Panama",
  PRY: "Paraguay",
  PER: "Peru",
  PHL: "Philippines",
  POL: "Poland",
  PRT: "Portugal",
  QAT: "Qatar",
  ROU: "Romania",
  RUS: "Russia",
  SAU: "Saudi Arabia",
  SRB: "Serbia",
  SGP: "Singapore",
  SVK: "Slovakia",
  SVN: "Slovenia",
  ZAF: "South Africa",
  KOR: "South Korea",
  ESP: "Spain",
  LKA: "Sri Lanka",
  SWE: "Sweden",
  CHE: "Switzerland",
  TWN: "Taiwan",
  TZA: "Tanzania",
  THA: "Thailand",
  TTO: "Trinidad and Tobago",
  TUN: "Tunisia",
  TUR: "Turkey",
  UGA: "Uganda",
  UKR: "Ukraine",
  ARE: "United Arab Emirates",
  GBR: "United Kingdom",
  USA: "United States",
  URY: "Uruguay",
  UZB: "Uzbekistan",
  VEN: "Venezuela",
  VNM: "Vietnam",
};

/** Lowercase alias / fragment → canonical name */
const ALIAS_TO_CANONICAL: Record<string, string> = (() => {
  const pairs: [string, string][] = [];
  const add = (alias: string, canonical: string) => {
    pairs.push([alias.trim().toLowerCase(), canonical]);
  };

  for (const c of FILTER_COUNTRY_CANONICALS) {
    add(c, c);
  }

  const many: [string, string][] = [
    ["us", "United States"],
    ["usa", "United States"],
    ["u.s.", "United States"],
    ["u.s.a.", "United States"],
    ["america", "United States"],
    ["uk", "United Kingdom"],
    ["gb", "United Kingdom"],
    ["gbr", "United Kingdom"],
    ["great britain", "United Kingdom"],
    ["britain", "United Kingdom"],
    ["england", "United Kingdom"],
    ["scotland", "United Kingdom"],
    ["wales", "United Kingdom"],
    ["northern ireland", "United Kingdom"],
    ["ca", "Canada"],
    ["au", "Australia"],
    ["de", "Germany"],
    ["fr", "France"],
    ["in", "India"],
    ["cn", "China"],
    ["jp", "Japan"],
    ["kr", "South Korea"],
    ["korea, republic of", "South Korea"],
    ["republic of korea", "South Korea"],
    ["vn", "Vietnam"],
    ["ph", "Philippines"],
    ["id", "Indonesia"],
    ["my", "Malaysia"],
    ["sg", "Singapore"],
    ["hk", "Hong Kong"],
    ["tw", "Taiwan"],
    ["nz", "New Zealand"],
    ["br", "Brazil"],
    ["mx", "Mexico"],
    ["ar", "Argentina"],
    ["za", "South Africa"],
    ["ae", "United Arab Emirates"],
    ["united arab emirates", "United Arab Emirates"],
    ["uae", "United Arab Emirates"],
    ["ie", "Ireland"],
    ["ireland", "Ireland"],
    ["ch", "Switzerland"],
    ["switzerland", "Switzerland"],
    ["at", "Austria"],
    ["austria", "Austria"],
    ["be", "Belgium"],
    ["belgium", "Belgium"],
    ["cz", "Czech Republic"],
    ["czech republic", "Czech Republic"],
    ["czechia", "Czech Republic"],
    ["greece", "Greece"],
    ["gr", "Greece"],
    ["hungary", "Hungary"],
    ["hu", "Hungary"],
    ["finland", "Finland"],
    ["fi", "Finland"],
    ["norway", "Norway"],
    ["no", "Norway"],
    ["denmark", "Denmark"],
    ["dk", "Denmark"],
    ["south africa", "South Africa"],
    ["taiwan", "Taiwan"],
    ["thailand", "Thailand"],
    ["th", "Thailand"],
    ["colombia", "Colombia"],
    ["co", "Colombia"],
    ["chile", "Chile"],
    ["cl", "Chile"],
    ["peru", "Peru"],
    ["pe", "Peru"],
    ["kenya", "Kenya"],
    ["ke", "Kenya"],
    ["saudi arabia", "Saudi Arabia"],
    ["saudi", "Saudi Arabia"],
    ["sa", "Saudi Arabia"],
    ["qatar", "Qatar"],
    ["qa", "Qatar"],
    ["israel", "Israel"],
    ["il", "Israel"],
    ["romania", "Romania"],
    ["ro", "Romania"],
    ["bulgaria", "Bulgaria"],
    ["bg", "Bulgaria"],
    ["croatia", "Croatia"],
    ["hr", "Croatia"],
    ["serbia", "Serbia"],
    ["rs", "Serbia"],
    ["slovakia", "Slovakia"],
    ["sk", "Slovakia"],
    ["slovenia", "Slovenia"],
    ["si", "Slovenia"],
    ["lithuania", "Lithuania"],
    ["lt", "Lithuania"],
    ["latvia", "Latvia"],
    ["lv", "Latvia"],
    ["estonia", "Estonia"],
    ["ee", "Estonia"],
    ["luxembourg", "Luxembourg"],
    ["lu", "Luxembourg"],
    ["iceland", "Iceland"],
    ["is", "Iceland"],
    ["malta", "Malta"],
    ["mt", "Malta"],
    ["cyprus", "Cyprus"],
    ["cy", "Cyprus"],
    ["morocco", "Morocco"],
    ["ma", "Morocco"],
    ["tunisia", "Tunisia"],
    ["tn", "Tunisia"],
    ["algeria", "Algeria"],
    ["dz", "Algeria"],
    ["ghana", "Ghana"],
    ["gh", "Ghana"],
    ["uganda", "Uganda"],
    ["ug", "Uganda"],
    ["tanzania", "Tanzania"],
    ["tz", "Tanzania"],
    ["ethiopia", "Ethiopia"],
    ["et", "Ethiopia"],
    ["iran", "Iran"],
    ["ir", "Iran"],
    ["iraq", "Iraq"],
    ["iq", "Iraq"],
    ["kazakhstan", "Kazakhstan"],
    ["kz", "Kazakhstan"],
    ["uzbekistan", "Uzbekistan"],
    ["uz", "Uzbekistan"],
    ["nepal", "Nepal"],
    ["np", "Nepal"],
    ["afghanistan", "Afghanistan"],
    ["af", "Afghanistan"],
    ["bangladesh", "Bangladesh"],
    ["bd", "Bangladesh"],
    ["sri lanka", "Sri Lanka"],
    ["lk", "Sri Lanka"],
    ["new zealand", "New Zealand"],
    ["russian federation", "Russia"],
    ["ru", "Russia"],
    ["belarus", "Belarus"],
    ["by", "Belarus"],
    ["moldova", "Moldova"],
    ["md", "Moldova"],
    ["georgia", "Georgia"],
    ["ge", "Georgia"],
    ["armenia", "Armenia"],
    ["am", "Armenia"],
    ["azerbaijan", "Azerbaijan"],
    ["az", "Azerbaijan"],
    ["panama", "Panama"],
    ["pa", "Panama"],
    ["costa rica", "Costa Rica"],
    ["cr", "Costa Rica"],
    ["ecuador", "Ecuador"],
    ["ec", "Ecuador"],
    ["venezuela", "Venezuela"],
    ["ve", "Venezuela"],
    ["uruguay", "Uruguay"],
    ["uy", "Uruguay"],
    ["paraguay", "Paraguay"],
    ["py", "Paraguay"],
    ["bolivia", "Bolivia"],
    ["bo", "Bolivia"],
    ["dominican republic", "Dominican Republic"],
    ["do", "Dominican Republic"],
    ["jamaica", "Jamaica"],
    ["jm", "Jamaica"],
    ["trinidad", "Trinidad and Tobago"],
    ["trinidad and tobago", "Trinidad and Tobago"],
    ["tt", "Trinidad and Tobago"],
    ["cambodia", "Cambodia"],
    ["kh", "Cambodia"],
    ["laos", "Laos"],
    ["la", "Laos"],
    ["myanmar", "Myanmar"],
    ["mm", "Myanmar"],
    ["burma", "Myanmar"],
  ];

  const canonSet = new Set(FILTER_COUNTRY_CANONICALS);
  for (const [a, c] of many) {
    if (canonSet.has(c)) add(a, c);
  }

  const map: Record<string, string> = {};
  for (const [k, v] of pairs) {
    if (!(k in map)) map[k] = v;
  }
  return map;
})();

/** Aliases grouped by canonical (lowercase) for search */
const CANONICAL_SEARCH_BLOB = (() => {
  const blobs: Record<string, string> = {};
  for (const c of FILTER_COUNTRY_CANONICALS) {
    blobs[c] = c.toLowerCase();
  }
  for (const [alias, canonical] of Object.entries(ALIAS_TO_CANONICAL)) {
    blobs[canonical] = `${blobs[canonical] || canonical.toLowerCase()} ${alias}`;
  }
  return blobs;
})();

/** Map a job's client_country string to a canonical name we filter on, if known. */
export function normalizeJobCountryToCanonical(
  raw: string | null | undefined,
): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const viaAlias = ALIAS_TO_CANONICAL[lower];
  if (viaAlias) return viaAlias;

  // Checked before the substring fallback so alpha-3 codes resolve exactly.
  const viaIso3 = ISO3_TO_CANONICAL[t.toUpperCase()];
  if (viaIso3) return viaIso3;

  for (const c of FILTER_COUNTRY_CANONICALS) {
    if (c.toLowerCase() === lower) return c;
  }

  // Prefix / contains match against canonical (e.g. "United States of America")
  for (const c of FILTER_COUNTRY_CANONICALS) {
    const cl = c.toLowerCase();
    if (lower.includes(cl) || cl.includes(lower)) return c;
  }

  return null;
}

/** Canonical names matching search (partial, case-insensitive; searches name + aliases). */
export function filterCountriesBySearch(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...FILTER_COUNTRY_CANONICALS];

  const out: string[] = [];
  for (const c of FILTER_COUNTRY_CANONICALS) {
    const blob = CANONICAL_SEARCH_BLOB[c] ?? c.toLowerCase();
    if (blob.includes(q) || c.toLowerCase().includes(q)) {
      out.push(c);
    }
  }
  return out;
}

export function jobMatchesCountryFilters(
  clientCountry: string | null | undefined,
  includeCanonicals: string[],
  excludeCanonicals: string[],
): boolean {
  const canon = normalizeJobCountryToCanonical(clientCountry);
  const includeSet = new Set(includeCanonicals);
  const excludeSet = new Set(excludeCanonicals);

  if (includeSet.size > 0) {
    if (canon == null || !includeSet.has(canon)) return false;
  }

  if (excludeSet.size > 0 && canon != null && excludeSet.has(canon)) {
    return false;
  }

  return true;
}
