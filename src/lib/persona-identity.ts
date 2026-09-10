/**
 * Builds markdown-style lines for AI context from a persona or profile-like row.
 */
export type PersonaIdentityFields = {
  full_name: string | null;
  role_title: string | null;
  bio: string | null;
  years_of_experience: number | null;
  skills: string[] | null;
  specializations: string[] | null;
  certifications: string[] | null;
  upwork_url: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  github_url: string | null;
};

export function buildIdentityContextFromPersona(
  persona: PersonaIdentityFields,
): string | undefined {
  const details: string[] = [];

  if (persona.full_name) {
    details.push(`Name: ${persona.full_name}`);
  }
  if (persona.role_title) {
    details.push(`Role / Title: ${persona.role_title}`);
  }
  if (persona.years_of_experience != null) {
    details.push(`Years of experience: ${persona.years_of_experience} years`);
  }
  if (persona.skills?.length) {
    details.push(`Key skills: ${persona.skills.join(", ")}`);
  }
  if (persona.specializations?.length) {
    details.push(`Specializations: ${persona.specializations.join(", ")}`);
  }
  if (persona.certifications?.length) {
    details.push(`Certifications: ${persona.certifications.join(", ")}`);
  }
  if (persona.bio) {
    details.push(`Bio: ${persona.bio}`);
  }
  if (persona.upwork_url) {
    details.push(`Upwork: ${persona.upwork_url}`);
  }
  if (persona.linkedin_url) {
    details.push(`LinkedIn: ${persona.linkedin_url}`);
  }
  if (persona.website_url) {
    details.push(`Website: ${persona.website_url}`);
  }
  if (persona.github_url) {
    details.push(`GitHub: ${persona.github_url}`);
  }

  if (details.length === 0) {
    return undefined;
  }
  return "Selected persona profile:\n" + details.join("\n");
}
