/**
 * Map country name to a representative city for timezone lookup.
 * Used for displaying client local time.
 */
const COUNTRY_TIMEZONES: Record<string, string> = {
  "United States": "America/New_York",
  US: "America/New_York",
  USA: "America/New_York",
  "South Korea": "Asia/Seoul",
  KR: "Asia/Seoul",
  India: "Asia/Kolkata",
  IN: "Asia/Kolkata",
  "United Kingdom": "Europe/London",
  UK: "Europe/London",
  GB: "Europe/London",
  Canada: "America/Toronto",
  CA: "America/Toronto",
  Australia: "Australia/Sydney",
  AU: "Australia/Sydney",
  Germany: "Europe/Berlin",
  DE: "Europe/Berlin",
  France: "Europe/Paris",
  FR: "Europe/Paris",
  Philippines: "Asia/Manila",
  PH: "Asia/Manila",
  Pakistan: "Asia/Karachi",
  PK: "Asia/Karachi",
  Ukraine: "Europe/Kyiv",
  UA: "Europe/Kyiv",
  Poland: "Europe/Warsaw",
  PL: "Europe/Warsaw",
  Spain: "Europe/Madrid",
  ES: "Europe/Madrid",
  Brazil: "America/Sao_Paulo",
  BR: "America/Sao_Paulo",
  Netherlands: "Europe/Amsterdam",
  NL: "Europe/Amsterdam",
  Italy: "Europe/Rome",
  IT: "Europe/Rome",
  Indonesia: "Asia/Jakarta",
  ID: "Asia/Jakarta",
  Vietnam: "Asia/Ho_Chi_Minh",
  VN: "Asia/Ho_Chi_Minh",
  Egypt: "Africa/Cairo",
  EG: "Africa/Cairo",
  "Sri Lanka": "Asia/Colombo",
  LK: "Asia/Colombo",
  Romania: "Europe/Bucharest",
  RO: "Europe/Bucharest",
  "Hong Kong": "Asia/Hong_Kong",
  HK: "Asia/Hong_Kong",
  Argentina: "America/Argentina/Buenos_Aires",
  AR: "America/Argentina/Buenos_Aires",
  Turkey: "Europe/Istanbul",
  TR: "Europe/Istanbul",
  Malaysia: "Asia/Kuala_Lumpur",
  MY: "Asia/Kuala_Lumpur",
  Mexico: "America/Mexico_City",
  MX: "America/Mexico_City",
  Japan: "Asia/Tokyo",
  JP: "Asia/Tokyo",
  Russia: "Europe/Moscow",
  RU: "Europe/Moscow",
  China: "Asia/Shanghai",
  CN: "Asia/Shanghai",
  Israel: "Asia/Jerusalem",
  IL: "Asia/Jerusalem",
  Singapore: "Asia/Singapore",
  SG: "Asia/Singapore",
  Sweden: "Europe/Stockholm",
  SE: "Europe/Stockholm",
  Portugal: "Europe/Lisbon",
  PT: "Europe/Lisbon",
  "New Zealand": "Pacific/Auckland",
  NZ: "Pacific/Auckland",
};

/** Get timezone for country; returns null if unknown */
function getTimezoneForCountry(country: string | null | undefined): string | null {
  if (!country || typeof country !== "string") return null;
  const trimmed = country.trim();
  return (
    COUNTRY_TIMEZONES[trimmed] ??
    COUNTRY_TIMEZONES[trimmed.toUpperCase()] ??
    null
  );
}

/**
 * Format client's local time based on country.
 * Returns e.g. "12:38 AM" or "Deming 12:38 AM" if city is provided.
 */
export function formatClientLocalTime(
  country: string | null | undefined,
  city?: string | null,
): string {
  const tz = getTimezoneForCountry(country);
  if (!tz) return "—";

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const time = formatter.format(new Date());
    return city && city.trim() ? `${city.trim()} ${time}` : time;
  } catch {
    return "—";
  }
}

/** Alias for formatClientLocalTime */
export const getClientTimeForCountry = formatClientLocalTime;
