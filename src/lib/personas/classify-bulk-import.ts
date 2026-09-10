import {
  createPersonaSchema,
  type CreatePersonaInput,
} from "@/lib/personas/persona-schema";
import type { UpworkPersonaDraft } from "@/lib/personas/map-upwork-member-to-persona";

export type BulkImportClassification =
  | { status: "ready"; values: CreatePersonaInput }
  | { status: "duplicate" }
  | { status: "incomplete"; missing: string[] };

/**
 * Human-readable label per schema field, for telling the user what a skipped
 * member was missing. Anything not listed falls back to the field name.
 */
const FIELD_LABELS: Record<string, string> = {
  full_name: "a name",
  role_title: "a role",
  bio: "a bio",
  skills: "skills",
  upwork_url: "a valid Upwork link",
  avatar_url: "a valid avatar link",
  years_of_experience: "valid experience",
  specializations: "specializations",
  certifications: "certifications",
  upwork_person_id: "an Upwork id",
};

/**
 * Decides whether one Upwork draft can be inserted without the persona form.
 *
 * Validates through `createPersonaSchema`, the SAME schema `POST /api/personas`
 * uses, rather than restating its rules. That is deliberate: if the two drifted,
 * the "Import all N" button would promise more than the endpoint delivers.
 *
 * The duplicate check runs FIRST so an already-imported person is never
 * reported as incomplete, which would look actionable when there is nothing to
 * act on.
 */
export function classifyDraftForBulkImport(
  draft: UpworkPersonaDraft,
  alreadyImported: ReadonlySet<string>,
): BulkImportClassification {
  if (alreadyImported.has(draft.upwork_person_id)) {
    return { status: "duplicate" };
  }

  const parsed = createPersonaSchema.safeParse(draft);
  if (parsed.success) {
    return { status: "ready", values: parsed.data };
  }

  const missing: string[] = [];
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "");
    const label = FIELD_LABELS[field] ?? field;
    if (label && !missing.includes(label)) {
      missing.push(label);
    }
  }

  return { status: "incomplete", missing };
}
