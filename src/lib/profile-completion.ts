/**
 * Profile completion calculation - shared logic for API and UI.
 * Sections: personalInfo 15%, professionalBio 25%, coreSkills 15%,
 * specializations 10%, socialLinks 25%, experience 10%.
 *
 * Every section is all-or-nothing: it awards its full weight as soon as it has
 * any content. socialLinks follows the same rule and needs only ONE of the four
 * links. It previously required all four, which made 25 points effectively
 * unreachable and left otherwise-complete profiles stuck below the proposal
 * threshold.
 *
 * Changing any weight or condition here moves the score of every existing
 * persona, since `persona-proposal-eligibility` gates on the result.
 */

export type ProfileForCompletion = {
  full_name?: string | null;
  role_title?: string | null;
  location?: string | null;
  bio?: string | null;
  skills?: string[] | null;
  specializations?: string[] | null;
  years_of_experience?: number | string | null;
  certifications?: string[] | null;
  upwork_url?: string | null;
  linkedin_url?: string | null;
  website_url?: string | null;
  github_url?: string | null;
};

/**
 * Compute profile completion percentage (0-100).
 */
export function computeProfileCompletion(
  profile: ProfileForCompletion | null,
): number {
  if (!profile) return 0;

  const sections = {
    personalInfo: {
      filled: !!(profile.full_name || profile.role_title || profile.location),
      weight: 15,
    },
    professionalBio: {
      filled: !!profile.bio,
      weight: 25,
    },
    coreSkills: {
      filled: Array.isArray(profile.skills) && profile.skills.length > 0,
      weight: 15,
    },
    specializations: {
      filled:
        Array.isArray(profile.specializations) &&
        profile.specializations.length > 0,
      weight: 10,
    },
    experience: {
      filled:
        (profile.years_of_experience != null &&
          profile.years_of_experience !== "") ||
        (Array.isArray(profile.certifications) &&
          profile.certifications.filter(Boolean).length > 0),
      weight: 10,
    },
    socialLinks: {
      // Any ONE link earns the section.
      filled: !!(
        profile.upwork_url ||
        profile.linkedin_url ||
        profile.website_url ||
        profile.github_url
      ),
      weight: 25,
    },
  };

  let total = 0;
  for (const section of Object.values(sections)) {
    if (section.filled) total += section.weight;
  }
  return total;
}

/** Minimum completion % required for a member to be selectable in proposals (e.g. team member dropdown). */
export const MIN_PROFILE_COMPLETION_FOR_PROPOSALS = 70;
