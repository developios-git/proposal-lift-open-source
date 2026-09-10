import { z } from "zod";

const requiredString = (min: number, max: number, message: string) =>
  z.preprocess((v) => v ?? "", z.string().min(min, message).max(max));

export const createHookSchema = z.object({
  title: requiredString(4, 200, "Title must be at least 4 characters"),
  description: requiredString(20, 10000, "Description must be at least 20 characters"),
});

export const updateHookSchema = z.object({
  title: requiredString(4, 200, "Title must be at least 4 characters").optional(),
  description: requiredString(20, 10000, "Description must be at least 20 characters").optional(),
});

export type CreateHookInput = z.infer<typeof createHookSchema>;
export type UpdateHookInput = z.infer<typeof updateHookSchema>;
