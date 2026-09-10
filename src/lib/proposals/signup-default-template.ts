import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { seedFirstRunGettingStarted } from "@/lib/onboarding/seed-first-run";

/** Display name + idempotency key for the template row created at self-serve signup. */
export const SIGNUP_DEFAULT_SOLO_TEMPLATE_NAME = "Universal proposal (starter)";

const SIGNUP_DEFAULT_CATEGORY = "general";

const SIGNUP_DEFAULT_VARIABLES = [
  "fit_line",
  "proof_line",
  "plan_steps",
  "questions",
  "next_step",
] as const;

/**
 * Short, niche-agnostic structure (body only; hook is generated separately).
 * The model fills placeholders from the job + persona + KB.
 */
const SIGNUP_DEFAULT_TEMPLATE_BODY = `{{fit_line}}

{{proof_line}}

How I'd move forward (kept tight on purpose):
{{plan_steps}}

{{questions}}

{{next_step}}

Thanks for reading — happy to adjust scope or timeline to match how you like to work.`;

type ServiceDb = SupabaseClient<Database>;

/**
 * Inserts the solo starter template once per user (same name + null org), if missing.
 * Safe to call multiple times.
 */
export async function seedSoloSignupDefaultTemplate(
  service: ServiceDb,
  userId: string,
): Promise<{ created: boolean; templateId?: string }> {
  const { data: existing } = await service
    .from("templates")
    .select("id")
    .eq("user_id", userId)
    .eq("name", SIGNUP_DEFAULT_SOLO_TEMPLATE_NAME)
    .maybeSingle();

  if (existing?.id) {
    return { created: false, templateId: existing.id };
  }

  const { data: inserted, error } = await service
    .from("templates")
    .insert({
      name: SIGNUP_DEFAULT_SOLO_TEMPLATE_NAME,
      category: SIGNUP_DEFAULT_CATEGORY,
      content: SIGNUP_DEFAULT_TEMPLATE_BODY,
      variables: [...SIGNUP_DEFAULT_VARIABLES],
      is_default: true,
      user_id: userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[seedSoloSignupDefaultTemplate]", error.message);
    return { created: false };
  }

  const row = inserted as { id: string } | null;
  return row?.id
    ? { created: true, templateId: row.id }
    : { created: false };
}

export function findSignupDefaultTemplateId<
  T extends { id: string; name: string },
>(templates: T[] | null | undefined): string | undefined {
  if (!templates?.length) return undefined;
  const match = templates.find(
    (t) => t.name === SIGNUP_DEFAULT_SOLO_TEMPLATE_NAME,
  );
  return match?.id;
}

/**
 * Resolves which template id to send to POST /api/proposals/generate.
 * - "none" → no template (explicit opt-out)
 * - Empty / unset → starter template id when still present in the catalog
 * - Any other non-empty value → passed through
 */
export function resolveTemplateIdForProposalGenerate(
  rawTemplateId: string | undefined,
  templates: Array<{ id: string; name: string }> | undefined,
): string | undefined {
  const trimmed = (rawTemplateId ?? "").trim();
  if (trimmed === "none") {
    return undefined;
  }
  if (trimmed === "") {
    return findSignupDefaultTemplateId(templates);
  }
  return trimmed;
}

/**
 * Everything a brand-new account needs on first sight.
 *
 * Called from all three signup paths — email signup, the OAuth callback, and
 * the email-confirmation callback — because a user can arrive through any of
 * them and each must leave the same starting state.
 *
 * Safe to call repeatedly: the template seeder keys off its own name and the
 * getting-started seeder off its own row. Upstream instead gated this on a
 * `profiles.registration_origin` marker and a 15-minute window after account
 * creation, which existed to tell self-serve Google signups apart from invited
 * teammates. There are no invitations here, and that column is gone, so
 * idempotency alone is the right guard.
 */
export async function seedNewUserDefaults(
  service: ServiceDb,
  userId: string,
): Promise<void> {
  await seedFirstRunGettingStarted(service, userId);
  await seedSoloSignupDefaultTemplate(service, userId);
}
