import { z } from "zod";

const STRIP_ALL_RE = /<[^>]*>/g;

// lightweight strip for schema-level coercion (no sanitize-html import needed here)
const stripTags = (v: string) => v.replace(STRIP_ALL_RE, "").trim();

export const createTemplateSchema = z.object({
  name: z.preprocess(
    (v) => (typeof v === "string" ? stripTags(v) : v),
    z.string().min(3, "Template name must be at least 3 characters").max(200),
  ),
  category: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().min(1, "Category is required").max(100),
  ),
  content: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().min(10, "Content must be at least 10 characters").max(50000),
  ),
  description: z.preprocess(
    (v) => (typeof v === "string" ? stripTags(v) : v),
    z.string().max(1000).nullable().optional(),
  ),
  variables: z.array(z.string().max(100)).max(100).default([]),
});

export const updateTemplateSchema = createTemplateSchema.partial().extend({
  name: z.preprocess(
    (v) => (typeof v === "string" ? stripTags(v) : v),
    z.string().min(3, "Template name must be at least 3 characters").max(200),
  ).optional(),
  content: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().min(10, "Content must be at least 10 characters").max(50000),
  ).optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
