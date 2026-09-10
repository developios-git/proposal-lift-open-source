import { z } from "zod";

/**
 * Upstream carried an `organization_id` field so a project could be created
 * against an org, and `updateProjectSchema` omitted it because a project could
 * not be moved between orgs. Ownership is set by the `projects_set_user_id`
 * trigger from `auth.uid()` here, so it is never part of the request body and
 * the two schemas are now identical.
 */
export const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(200, "Name must be 200 characters or less"),
  url: z.string().url("Must be a valid URL").max(2000).nullable().optional(),
  category: z.string().min(1, "Category is required").max(100),
  client_name: z.string().max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  technologies: z.array(z.string().max(100)).max(50).default([]),
  is_featured: z.boolean().default(false),
});

export const updateProjectSchema = createProjectSchema;

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
