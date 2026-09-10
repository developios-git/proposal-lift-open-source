  import { z } from "zod";

const optionalString = (min: number, max: number, label: string) =>
  z.preprocess(
    (v) => v ?? null,
    z
      .string()
      .min(min, `${label} must be at least ${min} characters`)
      .max(max)
      .nullable()
      .optional(),
  );

const urlField = z
  .string()
  .url({ message: "Must be a valid URL" })
  .max(2000)
  .nullable()
  .optional();

const tagsArray = z.array(z.string().min(1).max(200)).max(100).default([]);

export const updateProfileSchema = z.object({
  full_name: optionalString(2, 200, "Full name"),
  avatar_url: z.preprocess((v) => v ?? null, urlField),
  bio: optionalString(10, 10000, "Bio"),
  role_title: optionalString(2, 200, "Role title"),
  location: optionalString(2, 200, "Location"),
  timezone: optionalString(2, 100, "Timezone"),
  years_of_experience: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().int().min(0).max(100).nullable().optional(),
  ),
  skills: tagsArray,
  specializations: tagsArray,
  certifications: z.array(z.string().min(1).max(500)).max(50).default([]),
  upwork_url: z.preprocess((v) => v ?? null, urlField),
  linkedin_url: z.preprocess((v) => v ?? null, urlField),
  website_url: z.preprocess((v) => v ?? null, urlField),
  github_url: z.preprocess((v) => v ?? null, urlField),
});

// `teamProfileSchema` is gone with /team/profile/:id. It existed only to make
// full_name, role_title and location required when an admin filled in a
// teammate's profile; nobody edits anyone else's profile here.

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
