import type {
  UpworkAgencyStaffMember,
  UpworkTalentProfile,
} from "@/lib/upwork/agency-member-types";

/**
 * Prefill payload for PersonaForm in create mode. Field names match the
 * `personas` columns so the form can hydrate it as a Partial<Persona>.
 *
 * `linkedin_url`, `website_url`, and `github_url` are deliberately absent:
 * Upwork exposes none of them, and the user fills them in the form.
 */
export type UpworkPersonaDraft = {
  full_name: string | null;
  role_title: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
  timezone: string | null;
  years_of_experience: number | null;
  skills: string[];
  specializations: string[];
  certifications: string[];
  upwork_url: string | null;
  upwork_person_id: string;
};

/** Well under the schema's max of 100, and far more than any real profile. */
const MAX_TAGS = 50;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

const clean = (value: string | null | undefined): string | null =>
  value?.trim() || null;

function joinLocation(
  city: string | null,
  country: string | null,
): string | null {
  const parts = [clean(city), clean(country)].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

function fullNameFrom(
  first: string | null,
  last: string | null,
  fallback: string | null,
): string | null {
  const joined = [clean(first), clean(last)].filter(Boolean).join(" ").trim();
  const name = joined || clean(fallback);
  // Upwork returns doubled internal spaces in StaffUser.name ("Hira  Zulfiqar")
  // and trailing spaces in personalData.firstName ("Hira "). Collapse runs of
  // whitespace here rather than in clean(), which is also used for the bio,
  // where the \n\n paragraph breaks are meaningful and must survive.
  return name ? name.replace(/\s+/g, " ") : null;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = clean(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/**
 * Whole years between the earliest usable employment start date and `now`.
 * Returns null when nothing parses. Clamped to 0..100 so the result always
 * satisfies createPersonaSchema's years_of_experience bounds.
 */
export function deriveYearsOfExperience(
  startDates: string[],
  now: Date,
): number | null {
  const nowMs = now.getTime();
  const timestamps = startDates
    .map((raw) => new Date(raw).getTime())
    .filter((ms) => Number.isFinite(ms) && ms <= nowMs);

  if (timestamps.length === 0) return null;

  const years = Math.floor((nowMs - Math.min(...timestamps)) / MS_PER_YEAR);
  return Math.min(100, Math.max(0, years));
}

/**
 * Builds the persona form prefill for one agency member.
 *
 * `profile` is null whenever Upwork returns no talent profile for that person,
 * either because the token cannot read other members' profiles or because the
 * member has no freelancer profile. The draft is still useful then: name,
 * photo, and profile URL come from the staff row and the user fills the rest.
 *
 * Nothing here is inferred. `specializations` stays empty when Upwork returns
 * no specialized profiles, even though that costs 10 completion points, so an
 * imported persona never claims something the member did not state.
 */
export function mapUpworkMemberToPersonaDraft(
  member: UpworkAgencyStaffMember,
  profile: UpworkTalentProfile | null,
  now: Date,
): UpworkPersonaDraft {
  return {
    full_name: fullNameFrom(
      profile?.firstName ?? member.firstName,
      profile?.lastName ?? member.lastName,
      member.name,
    ),
    role_title: clean(profile?.title),
    bio: clean(profile?.description),
    avatar_url: clean(profile?.portraitUrl) ?? clean(member.photoUrl),
    location: joinLocation(profile?.city ?? null, profile?.country ?? null),
    timezone: clean(profile?.timezone),
    years_of_experience: deriveYearsOfExperience(
      profile?.employmentStartDates ?? [],
      now,
    ),
    skills: dedupe(profile?.skills ?? []).slice(0, MAX_TAGS),
    specializations: dedupe(profile?.specializations ?? []).slice(0, MAX_TAGS),
    certifications: [],
    upwork_url: clean(profile?.profileUrl) ?? clean(member.publicUrl),
    upwork_person_id: member.personId,
  };
}
