import { z } from "zod";

const urlField = z
  .string()
  .url({ message: "Must be a valid URL" })
  .max(200)
  .nullable()
  .optional();

// Coerces null/undefined → "" so min(1) fires with the friendly message
// instead of Zod's generic "expected string, received null"
const requiredString = (max: number, message: string) =>
  z.preprocess((v) => v ?? "", z.string().min(1, message).max(max));

const tagsArray = z.array(z.string().min(1).max(200)).max(100).default([]);

export const createPersonaSchema = z.object({
  full_name: requiredString(100, "Full name is required"),
  avatar_url: urlField,
  bio: requiredString(10000, "Bio is required"),
  role_title: requiredString(100, "Role / title is required"),
  location: z.string().min(1).max(100).nullable().optional(),
  timezone: z.string().min(1).max(100).nullable().optional(),
  years_of_experience: z.number().int().min(0).max(100).nullable().optional(),
  skills: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(z.string().min(1).max(200)).min(1, "At least one skill is required").max(100),
  ),
  specializations: tagsArray,
  certifications: z.array(z.string().min(1).max(500)).max(50).default([]),
  upwork_url: urlField,
  linkedin_url: urlField,
  website_url: urlField,
  github_url: urlField,
  /** Upwork personId this persona was imported from. Null for hand-made personas. */
  upwork_person_id: z.string().min(1).max(64).nullable().optional(),
});

export const updatePersonaSchema = createPersonaSchema;

export type CreatePersonaInput = z.infer<typeof createPersonaSchema>;
export type UpdatePersonaInput = z.infer<typeof updatePersonaSchema>;
