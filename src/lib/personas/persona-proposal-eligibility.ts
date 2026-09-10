import {
  computeProfileCompletion,
  MIN_PROFILE_COMPLETION_FOR_PROPOSALS,
  type ProfileForCompletion,
} from "@/lib/profile-completion";

export function isPersonaEligibleForProposals(
  persona: ProfileForCompletion | null | undefined,
): boolean {
  return computeProfileCompletion(persona ?? null) >= MIN_PROFILE_COMPLETION_FOR_PROPOSALS;
}

export function filterPersonasEligibleForProposals<T extends ProfileForCompletion>(
  personas: T[],
): T[] {
  return personas.filter((p) => isPersonaEligibleForProposals(p));
}
