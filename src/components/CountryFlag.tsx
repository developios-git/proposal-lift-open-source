import { Globe } from "lucide-react";
import {
  iso2ForCanonical,
  normalizeJobCountryToCanonical,
} from "@/lib/country-filter";
import { cn } from "@/lib/utils";

/**
 * Resolves whatever Upwork sends — a full name, an alpha-2 code, or an alpha-3
 * code — down to the alpha-2 code `flag-icons` needs.
 */
export function iso2ForCountry(
  country: string | null | undefined,
): string | null {
  const canonical = normalizeJobCountryToCanonical(country);
  return canonical ? iso2ForCanonical(canonical) : null;
}

export interface CountryFlagProps {
  country: string | null | undefined;
  /** CSS width. Height follows the 4:3 flag ratio unless overridden. */
  width?: string;
  height?: string;
  className?: string;
  /** Renders a neutral globe when the country can't be resolved. */
  fallback?: boolean;
}

const DEFAULT_WIDTH = "1.25rem";
const DEFAULT_HEIGHT = "0.9375rem";

/**
 * SVG country flag via `flag-icons`.
 *
 * Deliberately not emoji: Windows ships no flag glyphs, so 🇺🇸 renders as the
 * letters "us" in Chrome and Edge — which is what our old emoji maps did for
 * most users.
 *
 * Size comes from inline styles, not Tailwind classes. flag-icons ships
 * *unlayered* CSS (`.fi { width: 1.333333em; line-height: 1em }`), and unlayered
 * rules outrank anything in Tailwind's `@layer utilities` — so `w-5 h-3.5`
 * would be silently ignored. Inline styles beat both.
 */
export function CountryFlag({
  country,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  className,
  fallback = true,
}: CountryFlagProps) {
  const iso2 = iso2ForCountry(country);

  if (!iso2) {
    if (!fallback) return null;
    return (
      <Globe
        className={cn("shrink-0 text-muted-foreground", className)}
        style={{ width, height: width }}
        aria-hidden
      />
    );
  }

  return (
    <span
      className={cn("fi shrink-0", `fi-${iso2.toLowerCase()}`, className)}
      style={{ width, height, display: "inline-block", lineHeight: 1 }}
      title={country ?? undefined}
      role="img"
      aria-label={country ?? iso2}
    />
  );
}
